/**
 * Configuración académica y recorrido de los alumnos (routes/academic.routes.ts):
 * estructura por defecto, esquema de evaluación, ciclo nuevo, cambio de curso, bajas y promoción anual.
 */
import { AcademicYear, Level, GradingPeriod, Grade } from '../models';
import { Op } from 'sequelize';
import { asyncHandler, badRequest, notFound, forbidden } from '../lib/http';
import { invalidateSchoolSession } from '../services/schoolSession';
import { createDefaultStructure as buildDefaultStructure, applyGradingScheme as applyScheme, suggestRanges, copyDivisionsToYear, GradingScheme } from '../services/academicSetup';
import { ensurePeriods } from '../services/schoolSetup';
import { transferStudents as moveStudents, withdrawStudent as withdraw, reactivateStudent as reactivate, promotionPlan as buildPromotionPlan, applyPromotion as promote } from '../services/studentLifecycle';
import { audit } from '../services/audit';
import { LEAVE_REASONS } from '../models/school/people';
import { sequelize } from '../models';

const requireCurrentYear = (academicYearId: number | null) => {
  if (!academicYearId) throw badRequest('Primero creá el ciclo lectivo.');
  return academicYearId;
};

// POST /structure/defaults
export const createDefaultStructure = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const result = await buildDefaultStructure(session.schoolId, requireCurrentYear(session.academicYearId), req.body);
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Division', action: 'create-defaults', after: { divisions: result.divisionsCreated, subjects: result.subjectsCreated } });
  invalidateSchoolSession();
  res.status(201).json(result);
});

// GET /periods/suggested-ranges — reparte el ciclo lectivo en partes iguales
export const getSuggestedRanges = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { scheme, academicYearId } = req.query as unknown as { scheme: GradingScheme; academicYearId?: number };
  const year = await AcademicYear.findOne({ where: { id: academicYearId ?? requireCurrentYear(session.academicYearId), schoolId: session.schoolId } });
  if (!year) throw notFound('Ciclo lectivo inexistente.');
  res.json({ scheme, ranges: suggestRanges(year.startDate, year.endDate, scheme === 'TRIMESTRAL' ? 3 : 4) });
});

// POST /periods/scheme
export const applyGradingScheme = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { scheme, ranges, levelIds, academicYearId } = req.body as { scheme: GradingScheme; ranges: Array<{ startDate: string; endDate: string }>; levelIds?: number[]; academicYearId?: number };
  // La conducción de un nivel solo aplica el esquema a su nivel.
  const wanted = levelIds?.length ? levelIds : session.scope.all ? undefined : session.scope.levelIds;
  if (!session.scope.all && wanted?.some((id) => !session.scope.levelIds.includes(id))) throw forbidden('Solo podés cambiar el esquema de tu nivel.');
  const summary = await applyScheme(session.schoolId, academicYearId ?? requireCurrentYear(session.academicYearId), scheme, ranges, wanted);
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'GradingPeriod', action: 'apply-scheme', after: { scheme, ranges, summary } });
  res.json({ scheme, summary });
});

/**
 * Nota de cuatrimestre: un período numérico de cierre por cada grupo (ej: "1º Cuatrimestre") del nivel,
 * ubicado después de sus bimestres. Sus fechas abarcan el grupo entero (se superponen a propósito).
 */
// POST /periods/summaries { levelId, academicYearId? }
export const addSummaryPeriods = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { levelId, academicYearId } = req.body as { levelId: number; academicYearId?: number };
  const year = academicYearId ?? requireCurrentYear(session.academicYearId);
  if (!session.scope.all && !session.scope.levelIds.includes(levelId)) throw forbidden('Ese nivel está fuera de tu alcance.');
  const periods = await GradingPeriod.findAll({ where: { schoolId: session.schoolId, levelId, academicYearId: year }, order: [['order', 'ASC']] });
  // Orden contiguo (1..n) antes de intercalar: si quedó algún hueco, se corrige acá.
  for (const [i, p] of periods.entries()) if (p.order !== i + 1) await p.update({ order: i + 1 });
  const groups = [...new Set(periods.filter((p) => p.groupName && !p.summaryOf).map((p) => p.groupName as string))];
  if (!groups.length) throw badRequest('Este nivel no tiene cuatrimestres (los períodos no están agrupados).');
  const created: string[] = [];
  await sequelize.transaction(async (transaction) => {
    for (const group of groups) {
      if (periods.some((p) => p.summaryOf === group)) continue;
      const members = periods.filter((p) => p.groupName === group && !p.summaryOf);
      const last = members[members.length - 1];
      // Deja lugar justo después del último bimestre del grupo (y refleja el corrimiento en memoria para el próximo grupo).
      const after = last.order;
      await GradingPeriod.increment('order', { by: 1, where: { schoolId: session.schoolId, levelId, academicYearId: year, order: { [Op.gt]: after } }, transaction });
      periods.forEach((p) => {
        if (p.order > after) p.order += 1;
      });
      await GradingPeriod.create(
        {
          schoolId: session.schoolId,
          levelId,
          academicYearId: year,
          name: `Nota ${group}`,
          groupName: group,
          kind: 'NUMERIC',
          order: last.order + 1,
          startDate: members.map((m) => m.startDate).filter(Boolean).sort()[0] ?? null,
          endDate: members.map((m) => m.endDate).filter(Boolean).sort().reverse()[0] ?? null,
          closedAt: null,
          summaryOf: group,
        },
        { transaction }
      );
      created.push(group);
    }
  });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'GradingPeriod', action: 'add-summaries', after: { levelId, created } });
  res.status(201).json({ created });
});

// DELETE /periods/summaries { levelId, academicYearId? } — solo si todavía no tienen notas.
export const removeSummaryPeriods = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { levelId, academicYearId } = req.body as { levelId: number; academicYearId?: number };
  const year = academicYearId ?? requireCurrentYear(session.academicYearId);
  if (!session.scope.all && !session.scope.levelIds.includes(levelId)) throw forbidden('Ese nivel está fuera de tu alcance.');
  const summaries = await GradingPeriod.findAll({ where: { schoolId: session.schoolId, levelId, academicYearId: year, summaryOf: { [Op.ne]: null } } });
  if (!summaries.length) return res.json({ removed: 0 });
  const withGrades = await Grade.count({ where: { periodId: summaries.map((p) => p.id) } });
  if (withGrades) throw badRequest('Ya hay notas de cuatrimestre cargadas: no se pueden quitar.');
  await GradingPeriod.destroy({ where: { id: summaries.map((p) => p.id) } });
  // Sin huecos en el orden después de quitar.
  const rest = await GradingPeriod.findAll({ where: { schoolId: session.schoolId, levelId, academicYearId: year }, order: [['order', 'ASC']] });
  for (const [i, p] of rest.entries()) if (p.order !== i + 1) await p.update({ order: i + 1 });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'GradingPeriod', action: 'remove-summaries', before: { levelId, removed: summaries.length } });
  res.json({ removed: summaries.length });
});

// POST /years — ciclo lectivo nuevo, con períodos y (opcional) los cursos del actual
export const createAcademicYear = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const body = req.body as { year: number; startDate: string; endDate: string; makeCurrent: boolean; copyDivisionsFromCurrent: boolean; copyAssignments: boolean };
  if (await AcademicYear.count({ where: { schoolId: session.schoolId, year: body.year } })) throw badRequest(`El ciclo ${body.year} ya existe.`);
  const result = await sequelize.transaction(async (transaction) => {
    if (body.makeCurrent) await AcademicYear.update({ isCurrent: false }, { where: { schoolId: session.schoolId }, transaction });
    const year = await AcademicYear.create(
      { schoolId: session.schoolId, year: body.year, startDate: body.startDate, endDate: body.endDate, isCurrent: body.makeCurrent },
      { transaction }
    );
    for (const level of await Level.findAll({ where: { schoolId: session.schoolId }, transaction })) await ensurePeriods(level, year, transaction);
    const divisionsCopied =
      body.copyDivisionsFromCurrent && session.academicYearId ? await copyDivisionsToYear(session.schoolId, session.academicYearId, year.id, body.copyAssignments, transaction) : 0;
    return { year, divisionsCopied };
  });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'AcademicYear', entityId: result.year.id, action: 'create', after: { year: body.year, divisionsCopied: result.divisionsCopied } });
  invalidateSchoolSession();
  res.status(201).json(result);
});

// POST /students/transfer
export const transferStudents = asyncHandler(async (req, res) => {
  const { studentIds, divisionId, reason } = req.body as { studentIds: number[]; divisionId: number; reason?: string | null };
  res.json(await moveStudents(req.schoolSession!, studentIds, divisionId, reason ?? null));
});

// GET /students/leave-reasons
export const listLeaveReasons = asyncHandler(async (_req, res) => {
  res.json(Object.entries(LEAVE_REASONS).map(([code, label]) => ({ code, label })));
});

// POST /students/:id/withdraw
export const withdrawStudent = asyncHandler(async (req, res) => {
  const { reason, date, notes } = req.body as { reason: keyof typeof LEAVE_REASONS; date: string; notes?: string | null };
  const student = await withdraw(req.schoolSession!, Number(req.params.id), reason, date, notes ?? null);
  res.json({ ok: true, studentId: student.id });
});

// POST /students/:id/reactivate
export const reactivateStudent = asyncHandler(async (req, res) => {
  const student = await reactivate(req.schoolSession!, Number(req.params.id), req.body.divisionId as number);
  res.json({ ok: true, studentId: student.id });
});

// GET /promotions/plan
export const getPromotionPlan = asyncHandler(async (req, res) => {
  res.json(await buildPromotionPlan(req.schoolSession!, Number((req.query as unknown as { targetYearId: number }).targetYearId)));
});

// POST /promotions
export const applyPromotion = asyncHandler(async (req, res) => {
  const { targetYearId, moves } = req.body as { targetYearId: number; moves: Array<{ studentId: number; outcome: 'PROMOTED' | 'REPEATS' | 'GRADUATED'; targetDivisionId: number | null }> };
  res.json(await promote(req.schoolSession!, targetYearId, moves));
});
