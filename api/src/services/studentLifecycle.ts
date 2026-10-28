import { Student, Enrollment, Division, Level, AcademicYear, UserRole, sequelize } from '../models';
import { LEAVE_REASONS, LeaveReason } from '../models/school/people';
import { RoleCode } from '../constants/roles';
import { SchoolSession, assertDivision } from './schoolSession';
import { audit } from './audit';
import { touchAccess } from './billing';
import { invalidateSchoolSession } from './schoolSession';
import { badRequest, conflict, notFound } from '../lib/http';
import { ensureStudentAccount, credentialOf, notApplicable, EnsureAccountResult, StudentCredential } from './studentAccounts';

/**
 * RECORRIDO DEL ALUMNO: cambio de curso, baja (con motivo), reactivación y promoción anual.
 * Nada se borra: las inscripciones de años anteriores quedan como historial (status COMPLETED).
 */

const LEVEL_ORDER = ['INICIAL', 'PRIMARIO', 'SECUNDARIO'];

/** Cuentas automáticas creadas al entrar a Secundario (las credenciales se entregan en la hoja imprimible). */
const newAccountsTally = () => ({ created: 0, skipped: 0, credentials: [] as StudentCredential[] });
const tally = (acc: ReturnType<typeof newAccountsTally>, res: EnsureAccountResult, student: { firstName: string; lastName: string }, label: string) => {
  const cred = credentialOf(res, student, label);
  if (cred) {
    acc.created++;
    acc.credentials.push(cred);
  } else if (res.status === 'skipped' && !notApplicable(res)) acc.skipped++;
};

/** Tipo de nivel de varias divisiones en una consulta (caché para ensureStudentAccount). */
const levelTypesOf = async (ids: number[]) =>
  new Map(
    ((await Division.findAll({ where: { id: [...new Set(ids)] }, attributes: ['id'], include: [{ model: Level, attributes: ['type'] }] })) as Array<Division & { Level?: Level }>).map((d) => [d.id, d.Level?.type ?? ''])
  );

// ---------------- Cambio de curso (mismo ciclo) ----------------

/** Pasa alumnos a otro curso del MISMO ciclo lectivo (ej: de 4º A a 4º B). */
export const transferStudents = async (session: SchoolSession, studentIds: number[], targetDivisionId: number, reason: string | null) => {
  const target = await Division.findOne({ where: { id: targetDivisionId, schoolId: session.schoolId } });
  if (!target) throw notFound('Curso de destino inexistente.');
  if (target.academicYearId !== session.academicYearId) throw badRequest('El curso de destino tiene que ser del ciclo lectivo actual. Para pasar de año usá la promoción anual.');
  assertDivision(session, target.id);

  const enrollments = await Enrollment.findAll({
    where: { studentId: studentIds, academicYearId: session.academicYearId!, status: 'ACTIVE' },
    include: [{ model: Student, where: { schoolId: session.schoolId, active: true }, attributes: ['id', 'firstName', 'lastName', 'dni', 'userId'] }],
  });
  if (enrollments.length !== new Set(studentIds).size) throw badRequest('Algún alumno no está inscripto en el ciclo actual o está dado de baja.');
  for (const enrollment of enrollments) assertDivision(session, enrollment.divisionId as number);

  const levelTypes = await levelTypesOf([target.id, ...enrollments.map((e) => e.divisionId as number)]);
  const toSecondary = levelTypes.get(target.id) === 'SECUNDARIO';
  const accounts = newAccountsTally();
  await sequelize.transaction(async (transaction) => {
    for (const enrollment of enrollments) {
      if (enrollment.divisionId === target.id) continue;
      const fromDivisionId = enrollment.divisionId as number;
      await enrollment.update({ divisionId: target.id }, { transaction });
      await audit(
        { schoolId: session.schoolId, userId: session.userId, entity: 'Student', entityId: enrollment.studentId as number, action: 'transfer', before: { divisionId: fromDivisionId }, after: { divisionId: target.id, reason } },
        transaction
      );
      // Entra a Secundario desde otro nivel: cuenta automática. Entre cursos de Secundario no se toca la cuenta.
      if (toSecondary && levelTypes.get(fromDivisionId) !== 'SECUNDARIO') {
        const st = enrollment.Student!;
        tally(accounts, await ensureStudentAccount({ schoolId: session.schoolId, actorUserId: session.userId, student: st, transaction, divisionId: target.id, levelTypes }), st, target.name);
      }
    }
  });
  invalidateSchoolSession();
  // Cuentas nuevas o reactivadas: abre su acceso en la facturación (como el alta y la reincorporación).
  if (toSecondary) touchAccess(session.schoolId);
  return { moved: enrollments.filter((e) => e.divisionId === target.id).length, target: target.name, accounts };
};

// ---------------- Baja y reactivación ----------------

/**
 * Da de baja a un alumno (cambio de colegio, egreso, etc.). Se conserva todo su historial; su familia
 * deja de verlo y su cuenta de estudiante se desactiva. Para facturación, cuenta el mes en curso.
 */
export const withdrawStudent = async (session: SchoolSession, studentId: number, reason: LeaveReason, date: string, notes: string | null) => {
  const student = await Student.findOne({ where: { id: studentId, schoolId: session.schoolId } });
  if (!student) throw notFound();
  if (!student.active) throw conflict(`${student.firstName} ya está dado/a de baja.`);
  await sequelize.transaction(async (transaction) => {
    await student.update({ active: false, leftAt: date, leaveReason: reason, leaveNotes: notes }, { transaction });
    await Enrollment.update({ status: 'WITHDRAWN' }, { where: { studentId, status: 'ACTIVE' }, transaction });
    if (student.userId) await UserRole.update({ active: false }, { where: { userId: student.userId, schoolId: session.schoolId, role: RoleCode.ESTUDIANTE }, transaction });
    await audit(
      { schoolId: session.schoolId, userId: session.userId, entity: 'Student', entityId: student.id, action: 'withdraw', after: { reason: LEAVE_REASONS[reason], date, notes } },
      transaction
    );
  });
  invalidateSchoolSession();
  touchAccess(session.schoolId);
  return student;
};

/** Reincorpora a un alumno dado de baja en un curso del ciclo actual. */
export const reactivateStudent = async (session: SchoolSession, studentId: number, divisionId: number) => {
  const student = await Student.findOne({ where: { id: studentId, schoolId: session.schoolId } });
  if (!student) throw notFound();
  if (student.active) throw conflict(`${student.firstName} ya está activo/a.`);
  const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId, academicYearId: session.academicYearId ?? 0 } });
  if (!division) throw badRequest('Elegí un curso del ciclo actual.');
  assertDivision(session, division.id);
  const account = await sequelize.transaction(async (transaction) => {
    await student.update({ active: true, leftAt: null, leaveReason: null, leaveNotes: null }, { transaction });
    await Enrollment.upsert(
      { studentId, divisionId: division.id, academicYearId: division.academicYearId as number, status: 'ACTIVE' },
      { transaction, conflictFields: ['studentId', 'academicYearId'] }
    );
    // Secundario: reactiva su cuenta (o se la crea si nunca tuvo). Otro nivel: solo se reactiva la que tenía.
    const r = await ensureStudentAccount({ schoolId: session.schoolId, actorUserId: session.userId, student, transaction, divisionId: division.id });
    if (notApplicable(r) && student.userId) await UserRole.update({ active: true }, { where: { userId: student.userId, schoolId: session.schoolId, role: RoleCode.ESTUDIANTE }, transaction });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Student', entityId: student.id, action: 'reactivate', after: { divisionId: division.id } }, transaction);
    return r;
  });
  invalidateSchoolSession();
  touchAccess(session.schoolId);
  return { student, account, credential: credentialOf(account, student, division.name) };
};

// ---------------- Promoción anual ----------------

export type PromotionOutcome = 'PROMOTED' | 'REPEATS' | 'GRADUATED';

interface DivisionInfo {
  id: number;
  name: string;
  gradeYear: number;
  section: string | null;
  levelId: number;
  levelType: string;
  levelName: string;
}

const describeDivisions = async (schoolId: number, academicYearId: number): Promise<DivisionInfo[]> =>
  (await Division.findAll({ where: { schoolId, academicYearId }, include: [{ model: Level, attributes: ['type', 'name'] }], order: [['levelId', 'ASC'], ['gradeYear', 'ASC'], ['name', 'ASC']] })).map((d) => ({
    id: d.id,
    name: d.name,
    gradeYear: d.gradeYear,
    section: d.section,
    levelId: d.levelId as number,
    levelType: d.Level!.type,
    levelName: d.Level!.name,
  }));

const sameSection = (a: DivisionInfo, b: DivisionInfo) => (a.section ?? '') === (b.section ?? '');
const pickSection = (candidates: DivisionInfo[], from: DivisionInfo) => candidates.find((c) => sameSection(c, from)) ?? candidates[0] ?? null;

/** Curso sugerido del año siguiente: mismo nivel y año+1; si no hay, el primer año del nivel siguiente; si no, egresa. */
const suggestTarget = (from: DivisionInfo, targets: DivisionInfo[]) => {
  const nextInLevel = targets.filter((t) => t.levelId === from.levelId && t.gradeYear === from.gradeYear + 1);
  if (nextInLevel.length) return { outcome: 'PROMOTED' as const, division: pickSection(nextInLevel, from) };
  const higherLevels = targets.filter((t) => LEVEL_ORDER.indexOf(t.levelType) > LEVEL_ORDER.indexOf(from.levelType));
  if (higherLevels.length && from.levelType !== 'SECUNDARIO') {
    const nextLevelType = higherLevels.map((t) => t.levelType).sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))[0];
    const lowest = Math.min(...higherLevels.filter((t) => t.levelType === nextLevelType).map((t) => t.gradeYear));
    return { outcome: 'PROMOTED' as const, division: pickSection(higherLevels.filter((t) => t.levelType === nextLevelType && t.gradeYear === lowest), from) };
  }
  return { outcome: 'GRADUATED' as const, division: null };
};

/** Plan de promoción: cada curso del ciclo actual con sus alumnos y el destino sugerido en el ciclo de destino. */
export const promotionPlan = async (session: SchoolSession, targetYearId: number) => {
  const [currentYear, targetYear] = await Promise.all([
    AcademicYear.findByPk(session.academicYearId ?? 0),
    AcademicYear.findOne({ where: { id: targetYearId, schoolId: session.schoolId } }),
  ]);
  if (!currentYear || !targetYear) throw notFound('Ciclo lectivo inexistente.');
  if (targetYear.year <= currentYear.year) throw badRequest('El ciclo de destino tiene que ser posterior al actual.');
  const [sources, targets] = await Promise.all([describeDivisions(session.schoolId, currentYear.id), describeDivisions(session.schoolId, targetYear.id)]);
  if (!targets.length) throw badRequest(`El ciclo ${targetYear.year} todavía no tiene cursos. Copialos desde el ciclo actual.`);

  const enrollments = await Enrollment.findAll({
    where: { academicYearId: currentYear.id, status: 'ACTIVE' },
    include: [{ model: Student, where: { schoolId: session.schoolId, active: true }, attributes: ['id', 'firstName', 'lastName'] }],
    order: [[Student, 'lastName', 'ASC'], [Student, 'firstName', 'ASC']],
  });
  const alreadyPromoted = new Set(
    (await Enrollment.findAll({ where: { academicYearId: targetYear.id }, attributes: ['studentId'], raw: true })).map((e) => e.studentId as number)
  );

  return {
    fromYear: currentYear.year,
    toYear: targetYear.year,
    targetDivisions: targets,
    divisions: sources.map((source) => {
      const suggestion = suggestTarget(source, targets);
      const repeatTarget = pickSection(targets.filter((t) => t.levelId === source.levelId && t.gradeYear === source.gradeYear), source);
      return {
        division: source,
        suggestedOutcome: suggestion.outcome,
        suggestedTargetId: suggestion.division?.id ?? null,
        repeatTargetId: repeatTarget?.id ?? null,
        students: enrollments
          .filter((e) => e.divisionId === source.id)
          .map((e) => ({ id: e.Student!.id, firstName: e.Student!.firstName, lastName: e.Student!.lastName, alreadyEnrolledInTarget: alreadyPromoted.has(e.Student!.id) })),
      };
    }),
  };
};

/**
 * Aplica la promoción y PASA AL CICLO NUEVO en un solo paso (así nunca queda un estado a medias):
 * inscribe a cada alumno en su curso del ciclo de destino (promovido o repitiendo) o lo da de baja como
 * egresado; la inscripción del ciclo que termina queda como historial (COMPLETED) y el ciclo de destino
 * pasa a ser el actual.
 */
export const applyPromotion = async (
  session: SchoolSession,
  targetYearId: number,
  moves: Array<{ studentId: number; outcome: PromotionOutcome; targetDivisionId: number | null }>
) => {
  const targetYear = await AcademicYear.findOne({ where: { id: targetYearId, schoolId: session.schoolId } });
  if (!targetYear) throw notFound('Ciclo lectivo inexistente.');
  const targetDivisions = (await Division.findAll({ where: { schoolId: session.schoolId, academicYearId: targetYear.id }, attributes: ['id', 'name'], include: [{ model: Level, attributes: ['type'] }] })) as Array<Division & { Level?: Level }>;
  const targetDivisionIds = new Set(targetDivisions.map((d) => d.id));
  const targetNames = new Map(targetDivisions.map((d) => [d.id, d.name]));
  const levelTypes = new Map(targetDivisions.map((d) => [d.id, d.Level?.type ?? '']));
  const result = { promoted: 0, repeating: 0, graduated: 0, skipped: 0 };
  const accounts = newAccountsTally();

  await sequelize.transaction(async (transaction) => {
    for (const move of moves) {
      const current = await Enrollment.findOne({
        where: { studentId: move.studentId, academicYearId: session.academicYearId ?? 0, status: 'ACTIVE' },
        include: [
          { model: Student, where: { schoolId: session.schoolId, active: true }, attributes: ['id', 'userId', 'firstName', 'lastName', 'dni'] },
          { model: Division, attributes: ['id'], include: [{ model: Level, attributes: ['type'] }] },
        ],
        transaction,
      });
      if (!current) {
        result.skipped++;
        continue;
      }
      if (move.outcome === 'GRADUATED') {
        await current.update({ status: 'COMPLETED' }, { transaction });
        await Student.update({ active: false, leftAt: targetYear.startDate, leaveReason: 'EGRESO', leaveNotes: null }, { where: { id: move.studentId }, transaction });
        if (current.Student!.userId) await UserRole.update({ active: false }, { where: { userId: current.Student!.userId, schoolId: session.schoolId, role: RoleCode.ESTUDIANTE }, transaction });
        result.graduated++;
        continue;
      }
      if (!move.targetDivisionId || !targetDivisionIds.has(move.targetDivisionId)) throw badRequest(`Falta el curso de destino de un alumno (id ${move.studentId}).`);
      const [, created] = await Enrollment.findOrCreate({
        where: { studentId: move.studentId, academicYearId: targetYear.id },
        defaults: { studentId: move.studentId, divisionId: move.targetDivisionId, academicYearId: targetYear.id, status: 'ACTIVE' },
        transaction,
      });
      if (!created) {
        result.skipped++;
        continue;
      }
      await current.update({ status: 'COMPLETED' }, { transaction });
      if (move.outcome === 'REPEATS') result.repeating++;
      else result.promoted++;
      // Pasa a Secundario (ej: 7º de Primario → 1º año): cuenta automática con la inscripción del ciclo de destino.
      const fromType = (current.Division as (Division & { Level?: Level }) | undefined)?.Level?.type;
      if (levelTypes.get(move.targetDivisionId) === 'SECUNDARIO' && fromType !== 'SECUNDARIO') {
        const st = current.Student!;
        const r = await ensureStudentAccount({ schoolId: session.schoolId, actorUserId: session.userId, student: st, transaction, divisionId: move.targetDivisionId, levelTypes });
        tally(accounts, r, st, targetNames.get(move.targetDivisionId) ?? '');
      }
    }
    await AcademicYear.update({ isCurrent: false }, { where: { schoolId: session.schoolId }, transaction });
    await targetYear.update({ isCurrent: true }, { transaction });
    // Sin las credenciales: las contraseñas temporales no van al registro de auditoría.
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'AcademicYear', entityId: targetYear.id, action: 'promotion', after: { ...result, accountsCreated: accounts.created, accountsSkipped: accounts.skipped } }, transaction);
  });
  invalidateSchoolSession();
  touchAccess(session.schoolId);
  return { ...result, accounts };
};

