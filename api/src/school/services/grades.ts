import { Op } from 'sequelize';
import {
  Grade,
  GradingPeriod,
  Subject,
  Level,
  Division,
  Enrollment,
  ReportCardPublication,
  TeachingAssignment,
} from '../../models';
import { LevelSettings, PeriodKind } from '../constants';
import { badRequest } from '../../lib/http';

export interface GradeEntry {
  studentId: number;
  numericValue?: number | null;
  conceptualValue?: string | null;
  narrative?: string | null;
  observation?: string | null;
}

/** Valida una nota según el tipo de período y la escala del nivel. Devuelve los campos a guardar. */
export const normalizeEntry = (entry: GradeEntry, kind: PeriodKind, settings: LevelSettings) => {
  const out = { numericValue: null as number | null, conceptualValue: null as string | null, narrative: null as string | null };
  if (kind === 'NUMERIC' && entry.numericValue !== null && entry.numericValue !== undefined) {
    const v = Number(entry.numericValue);
    if (Number.isNaN(v) || v < settings.numericMin || v > settings.numericMax)
      throw badRequest(`Nota fuera de rango (${settings.numericMin} a ${settings.numericMax}).`);
    out.numericValue = Math.round(v * 100) / 100;
  }
  if (kind === 'CONCEPTUAL' && entry.conceptualValue) {
    if (!settings.conceptualScale.includes(entry.conceptualValue))
      throw badRequest(`Valor conceptual inválido. Opciones: ${settings.conceptualScale.join(', ')}.`);
    out.conceptualValue = entry.conceptualValue;
  }
  if (kind === 'NARRATIVE' && entry.narrative) out.narrative = entry.narrative.trim().slice(0, 5000);
  return out;
};

export const isEmpty = (g: { numericValue: number | null; conceptualValue: string | null; narrative: string | null }) =>
  g.numericValue === null && !g.conceptualValue && !g.narrative;

/** "En riesgo": numérica por debajo de la aprobación o conceptual en el último escalón de la escala. */
export const isAtRisk = (
  g: { numericValue: number | null; conceptualValue: string | null },
  settings: LevelSettings
) =>
  (g.numericValue !== null && g.numericValue < settings.passingGrade) ||
  (!!g.conceptualValue && g.conceptualValue === settings.conceptualScale[settings.conceptualScale.length - 1]);

/**
 * Boletín de un alumno: materias × períodos, con nota de cada cuatrimestre y final anual
 * (promedio de los períodos numéricos) cuando corresponde.
 */
export const buildReportCard = async (opts: {
  studentId: number;
  academicYearId: number;
  onlyPublished: boolean;
}) => {
  const enrollment = await Enrollment.findOne({
    where: { studentId: opts.studentId, academicYearId: opts.academicYearId },
    include: [{ model: Division, include: [{ model: Level }] }],
  });
  if (!enrollment?.Division?.Level) return null;
  const division = enrollment.Division;
  const level = division.Level!;

  const [periods, assignments, grades, publications] = await Promise.all([
    GradingPeriod.findAll({ where: { levelId: level.id, academicYearId: opts.academicYearId }, order: [['order', 'ASC']] }),
    TeachingAssignment.findAll({ where: { divisionId: division.id }, include: [{ model: Subject, attributes: ['id', 'name'] }] }),
    Grade.findAll({ where: { studentId: opts.studentId, divisionId: division.id } }),
    ReportCardPublication.findAll({ where: { divisionId: division.id }, attributes: ['periodId', 'publishedAt'], raw: true }),
  ]);

  const publishedIds = new Set(publications.map((p) => p.periodId as number));
  const visiblePeriods = opts.onlyPublished ? periods.filter((p) => publishedIds.has(p.id)) : periods;
  const visibleIds = new Set(visiblePeriods.map((p) => p.id));

  const subjects = new Map<number, string>();
  assignments.forEach((a) => a.Subject && subjects.set(a.Subject.id, a.Subject.name));
  grades.forEach((g) => {
    if (!subjects.has(g.subjectId as number)) subjects.set(g.subjectId as number, 'Materia');
  });

  const numericPeriodIds = periods.filter((p) => p.kind === 'NUMERIC').map((p) => p.id);
  const rows = [...subjects.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'es'))
    .map(([subjectId, name]) => {
      const byPeriod: Record<number, { numericValue: number | null; conceptualValue: string | null; narrative: string | null; observation: string | null; atRisk: boolean }> = {};
      grades
        .filter((g) => g.subjectId === subjectId && visibleIds.has(g.periodId as number))
        .forEach((g) => {
          byPeriod[g.periodId as number] = {
            numericValue: g.numericValue,
            conceptualValue: g.conceptualValue,
            narrative: g.narrative,
            observation: g.observation,
            atRisk: isAtRisk(g, level.settings),
          };
        });
      const numerics = numericPeriodIds.map((id) => byPeriod[id]?.numericValue).filter((v): v is number => v !== null && v !== undefined);
      const complete = numericPeriodIds.length > 0 && numerics.length === numericPeriodIds.length;
      const final = complete ? Math.round((numerics.reduce((a, b) => a + b, 0) / numerics.length) * 100) / 100 : null;
      return { subjectId, subject: name, grades: byPeriod, final, finalApproved: final === null ? null : final >= level.settings.passingGrade };
    });

  return {
    division: { id: division.id, name: division.name },
    level: { id: level.id, name: level.name, type: level.type, settings: level.settings },
    periods: visiblePeriods.map((p) => ({ id: p.id, name: p.name, groupName: p.groupName, kind: p.kind, closed: !!p.closedAt, published: publishedIds.has(p.id) })),
    rows,
  };
};

/** Avance de carga por asignación y período: cuántos alumnos tienen nota. */
export const completionFor = async (divisionIds: number[], academicYearId: number) => {
  if (!divisionIds.length) return [];
  const [counts, enrolled] = await Promise.all([
    Grade.findAll({
      where: { divisionId: { [Op.in]: divisionIds } },
      attributes: ['divisionId', 'subjectId', 'periodId', [Grade.sequelize!.fn('COUNT', Grade.sequelize!.col('id')), 'n']],
      group: ['divisionId', 'subjectId', 'periodId'],
      raw: true,
    }) as unknown as Promise<Array<{ divisionId: number; subjectId: number; periodId: number; n: string }>>,
    Enrollment.findAll({
      where: { divisionId: { [Op.in]: divisionIds }, academicYearId, status: 'ACTIVE' },
      attributes: ['divisionId', [Enrollment.sequelize!.fn('COUNT', Enrollment.sequelize!.col('id')), 'n']],
      group: ['divisionId'],
      raw: true,
    }) as unknown as Promise<Array<{ divisionId: number; n: string }>>,
  ]);
  const students = new Map(enrolled.map((e) => [e.divisionId, Number(e.n)]));
  return counts.map((c) => ({ ...c, n: Number(c.n), students: students.get(c.divisionId) ?? 0 }));
};
