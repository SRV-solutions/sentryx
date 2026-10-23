/**
 * ¿A quién le llega un pedido de cambio de plan?
 *  - Docentes, preceptoría, familias y estudiantes: a la conducción de SU nivel (Dirección en Inicial y
 *    Primario, Rectoría en Secundario). El nivel sale de sus cargos, de las materias que dicta, de los
 *    cursos de sus hijos o de su propio curso.
 *  - Si su nivel no tiene conducción cargada: a Dirección/Rectoría de toda la escuela.
 *  - Si quien pide ya es conducción (o no hay nadie más): a la Representante Legal.
 * La Representante Legal siempre puede resolver cualquier pedido (es quien paga).
 */
import { Op } from 'sequelize';
import { UserRole, TeachingAssignment, Division, StudentGuardian, Student, Enrollment, User } from '../models';
import { RoleCode } from '../constants/roles';
import { currentAcademicYear } from './schoolSession';
import { roleLabel } from './roleRegistry';

const LEVEL_AUTHORITIES: string[] = [RoleCode.DIRECTOR, RoleCode.RECTOR];

/** Niveles con los que tiene relación la persona en el ciclo actual. */
const levelsOf = async (schoolId: number, userId: number) => {
  const year = await currentAcademicYear(schoolId);
  const [roles, teaching, children, self] = await Promise.all([
    UserRole.findAll({ where: { schoolId, userId, active: true, levelId: { [Op.ne]: null } }, attributes: ['levelId'], raw: true }),
    year ? TeachingAssignment.findAll({ where: { schoolId, teacherId: userId }, include: [{ model: Division, where: { academicYearId: year.id }, attributes: ['levelId'] }] }) : [],
    year
      ? StudentGuardian.findAll({
          where: { userId },
          include: [{ model: Student, where: { schoolId, active: true }, attributes: ['id'], include: [{ model: Enrollment, where: { academicYearId: year.id, status: 'ACTIVE' }, attributes: ['divisionId'], include: [{ model: Division, attributes: ['levelId'] }] }] }],
        })
      : [],
    year ? Student.findOne({ where: { schoolId, userId, active: true }, include: [{ model: Enrollment, where: { academicYearId: year.id, status: 'ACTIVE' }, required: false, include: [{ model: Division, attributes: ['levelId'] }] }] }) : null,
  ]);
  const ids = new Set<number>();
  roles.forEach((r) => r.levelId && ids.add(r.levelId as number));
  (teaching as Array<TeachingAssignment & { Division?: Division }>).forEach((t) => t.Division && ids.add(t.Division.levelId as number));
  (children as Array<StudentGuardian & { Student?: Student & { Enrollments?: Array<Enrollment & { Division?: Division }> } }>).forEach((g) =>
    g.Student?.Enrollments?.forEach((e) => e.Division && ids.add(e.Division.levelId as number))
  );
  (self as (Student & { Enrollments?: Array<Enrollment & { Division?: Division }> }) | null)?.Enrollments?.forEach((e) => e.Division && ids.add(e.Division.levelId as number));
  return [...ids];
};

export interface Approver { userId: number; name: string; role: string }

export const planApproversFor = async (schoolId: number, userId: number): Promise<Approver[]> => {
  const own = await UserRole.findAll({ where: { schoolId, userId, active: true }, attributes: ['role'], raw: true });
  const isLeadership = own.some((r) => [...LEVEL_AUTHORITIES, RoleCode.REPRESENTANTE_LEGAL as string].includes(r.role));
  let rows: UserRole[] = [];
  if (!isLeadership) {
    const levels = await levelsOf(schoolId, userId);
    if (levels.length) rows = await UserRole.findAll({ where: { schoolId, active: true, role: { [Op.in]: LEVEL_AUTHORITIES }, levelId: { [Op.in]: levels }, userId: { [Op.ne]: userId } } });
    if (!rows.length) rows = await UserRole.findAll({ where: { schoolId, active: true, role: { [Op.in]: LEVEL_AUTHORITIES }, levelId: null, userId: { [Op.ne]: userId } } });
  }
  if (!rows.length) rows = await UserRole.findAll({ where: { schoolId, active: true, role: RoleCode.REPRESENTANTE_LEGAL, userId: { [Op.ne]: userId } } });
  const users = new Map((await User.findAll({ where: { id: [...new Set(rows.map((r) => r.userId as number))], isActive: true }, attributes: ['id', 'firstName', 'lastName'] })).map((u) => [u.id, u]));
  const out = new Map<number, Approver>();
  for (const r of rows) {
    const u = users.get(r.userId as number);
    if (u && !out.has(u.id)) out.set(u.id, { userId: u.id, name: `${u.firstName} ${u.lastName}`, role: roleLabel(r.role) });
  }
  return [...out.values()];
};
