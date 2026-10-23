import { Op } from 'sequelize';
import { UserRole, StudentGuardian, Student, Enrollment, ThreadParticipant, Thread, TeachingAssignment, Division, User } from '../models';
import { SchoolSession, canSeeDivision } from './schoolSession';
import { forbidden, badRequest, notFound } from '../lib/http';
import { RoleCode, SchoolRole, isStaffRole } from '../constants/roles';
import { roleLabel, roleRank, highestRankOf } from './roleRegistry';
import { platformRolesOf } from './rbac';
import { Entity, Action } from '../constants/permissions';

/**
 * Reglas de administración de personas (quién puede otorgar roles, editar o blanquear a quién).
 * Toda decisión pasa por acá para que sea una sola política, auditable y testeable.
 */

/** Representante Legal o superadmin: administran a cualquiera del colegio. */
const isTopAuthority = (session: SchoolSession) => session.superAdmin || session.roles.includes(RoleCode.REPRESENTANTE_LEGAL);
const ownRank = (session: SchoolSession) => (session.superAdmin ? 1000 : highestRankOf(session.roles.filter(isStaffRole)));

/**
 * Roles propios: el superadmin (dueño de la plataforma) se pone y se saca cualquiera. El resto solo
 * roles de menor jerarquía que el suyo (una Rectora puede sumarse Docente, no Rectoría).
 */
export const assertSelfRole = (session: SchoolSession, role: SchoolRole) => {
  if (session.superAdmin) return;
  if (roleRank(role) >= highestRankOf(session.roles.filter(isStaffRole))) {
    throw forbidden(`No podés asignarte ni modificar tu propio rol de ${roleLabel(role)}: pedíselo a otra autoridad. Sí podés sumarte roles de menor jerarquía (ej: Docente).`);
  }
};

/** ¿Puede otorgar (o modificar) un rol de personal en ese nivel/divisiones? */
export const assertCanGrant = (session: SchoolSession, role: SchoolRole, levelId: number | null, divisionIds: number[] = []) => {
  if (!session.can(Entity.USERS, Action.UPDATE)) throw forbidden();
  if (role === RoleCode.TUTOR) throw badRequest('Las familias se vinculan desde la ficha del alumno.');
  if (role === RoleCode.ESTUDIANTE) throw badRequest('Las cuentas de estudiantes se crean desde la ficha del alumno.');
  if (!isTopAuthority(session) && roleRank(role) >= ownRank(session)) {
    throw forbidden(`No podés otorgar el rol ${roleLabel(role)}: solo roles de menor jerarquía que el tuyo.`);
  }
  if (!session.schoolWide) {
    // Ej: la Rectora de Secundario administra personal de Secundario, no de toda la institución.
    if (role !== RoleCode.DOCENTE && (!levelId || !session.scope.levelIds.includes(levelId))) {
      throw forbidden('Solo podés asignar personal a tu nivel.');
    }
    if (divisionIds.some((d) => !canSeeDivision(session, d))) throw forbidden('Alguna división está fuera de tu alcance.');
  }
};

export interface PersonInSchool {
  user: User;
  userRoles: UserRole[];
  /** Vínculos con alumnos de ESTA escuela. */
  guardianLinks: Array<StudentGuardian & { Student?: Student }>;
  staffRoles: SchoolRole[];
  isGuardian: boolean;
  /** Cuenta de estudiante: su legajo (puede estar desactivada). */
  student: Student | null;
}

export const loadPerson = async (session: SchoolSession, userId: number): Promise<PersonInSchool> => {
  const [user, userRoles, guardianLinks, student] = await Promise.all([
    User.findByPk(userId),
    UserRole.findAll({ where: { userId, schoolId: session.schoolId } }),
    StudentGuardian.findAll({ where: { userId }, include: [{ model: Student, where: { schoolId: session.schoolId }, attributes: ['id', 'firstName', 'lastName', 'photoUrl', 'active'] }] }),
    Student.findOne({ where: { userId, schoolId: session.schoolId } }),
  ]);
  if (!user || (!userRoles.length && !guardianLinks.length)) throw notFound('Esa persona no pertenece a la institución.');
  const staffRoles = [...new Set(userRoles.map((userRole) => userRole.role).filter((role, i) => userRoles[i].active && isStaffRole(role)))] as SchoolRole[];
  return { user, userRoles, guardianLinks: guardianLinks as PersonInSchool['guardianLinks'], staffRoles, isGuardian: guardianLinks.length > 0, student };
};

/** Divisiones actuales de los hijos de esa persona en esta escuela. */
const childDivisions = async (session: SchoolSession, studentIds: number[]) =>
  studentIds.length && session.academicYearId
    ? (await Enrollment.findAll({ where: { studentId: studentIds, academicYearId: session.academicYearId, status: 'ACTIVE' }, attributes: ['divisionId'], raw: true })).map((e) => e.divisionId as number)
    : [];

/**
 * ¿Puede editar datos / blanquear la contraseña de esa persona?
 * - Nunca a sí mismo (para eso está "Cambiar contraseña"), nunca al superadmin de Sentryx.
 * - Personal: solo de menor jerarquía y dentro de su nivel.
 * - Familias: con alcance sobre al menos uno de sus hijos.
 */
export const assertCanManagePerson = async (session: SchoolSession, person: PersonInSchool) => {
  if (!session.can(Entity.USERS, Action.UPDATE)) throw forbidden();
  if (person.user.id === session.userId) throw badRequest('Para tu propia cuenta usá "Mi perfil → Cambiar contraseña".');
  if ((await platformRolesOf(person.user.id)).includes(RoleCode.SUPERADMIN)) throw forbidden('Esa cuenta es del equipo de Sentryx.');

  if (person.staffRoles.length) {
    if (!isTopAuthority(session) && highestRankOf(person.staffRoles) >= ownRank(session)) {
      throw forbidden('Solo podés administrar cuentas de personal de menor jerarquía que la tuya.');
    }
    if (!session.schoolWide && !isTopAuthority(session)) {
      const levels = person.userRoles.filter((m) => m.active && isStaffRole(m.role) && m.role !== RoleCode.DOCENTE).map((m) => m.levelId);
      if (levels.some((l) => !l || !session.scope.levelIds.includes(l))) throw forbidden('Esa persona trabaja fuera de tu nivel.');
    }
  }
  if (person.student && !person.staffRoles.length && !session.scope.all) {
    const divs = await childDivisions(session, [person.student.id]);
    if (!divs.some((d) => canSeeDivision(session, d))) throw forbidden('Ese estudiante está fuera de tu alcance.');
  }
  // Familia con el acceso desactivado (vínculos dados de baja): el alcance se mide por sus vínculos históricos.
  if (!person.isGuardian && !person.staffRoles.length && !person.student && !session.scope.all) {
    const old = await StudentGuardian.unscoped().findAll({ where: { userId: person.user.id }, attributes: ['studentId'], raw: true });
    const divs = await childDivisions(session, old.map((g) => g.studentId as number));
    if (!divs.some((d) => canSeeDivision(session, d))) throw forbidden('Esa persona está fuera de tu alcance.');
  }
  if (person.isGuardian && !person.staffRoles.length && !session.scope.all) {
    const divs = await childDivisions(session, person.guardianLinks.map((g) => g.studentId as number));
    if (!divs.some((d) => canSeeDivision(session, d))) throw forbidden('Esa familia no tiene hijos dentro de tu alcance.');
  }
};

export type Visibility = 'self' | 'staff' | 'limited';

/**
 * Qué puede ver el usuario actual de otra persona:
 * - self: todo lo propio.
 * - staff: personal con USERS:READ sobre personal de la escuela o familias con hijos en su alcance.
 * - limited: nombre, foto, rol y biografía. Familias ↔ personal que atiende a sus hijos, o
 *   quienes comparten una conversación.
 */
export const visibilityOf = async (session: SchoolSession, person: PersonInSchool): Promise<Visibility> => {
  if (person.user.id === session.userId) return 'self';
  if (session.isStaff && session.can(Entity.USERS, Action.READ)) {
    if (person.staffRoles.length) return 'staff';
    if (session.scope.all) return 'staff';
    const divs = await childDivisions(session, [...person.guardianLinks.map((g) => g.studentId as number), ...(person.student ? [person.student.id] : [])]);
    if (divs.some((d) => canSeeDivision(session, d))) return 'staff';
  }
  // Comparten una conversación de esta escuela.
  const shared = await ThreadParticipant.count({
    where: { userId: person.user.id, threadId: { [Op.in]: (await ThreadParticipant.findAll({ where: { userId: session.userId }, attributes: ['threadId'], raw: true })).map((t) => t.threadId as number) } },
    include: [{ model: Thread, where: { schoolId: session.schoolId }, attributes: [] }],
  });
  if (shared) return 'limited';
  // Compañeros del mismo curso (estudiantes con cuenta): nombre y foto, para el canal del curso.
  if (session.self?.divisionId && person.student) {
    const [d] = await childDivisions(session, [person.student.id]);
    if (d === session.self.divisionId) return 'limited';
  }
  // Familia (o el propio estudiante) viendo a personal que trabaja con sus hijos / con él.
  const mine = [...session.childIds, ...(session.self ? [session.self.studentId] : [])];
  if (mine.length && person.staffRoles.length) {
    const divs = await childDivisions(session, mine);
    if (person.staffRoles.some((r) => r !== RoleCode.DOCENTE)) {
      const levelIds = new Set(
        (await Division.findAll({ where: { id: divs }, attributes: ['levelId'], raw: true })).map((d) => d.levelId as number)
      );
      if (person.userRoles.some((m) => m.active && isStaffRole(m.role) && m.role !== RoleCode.DOCENTE && (!m.levelId || levelIds.has(m.levelId)))) return 'limited';
    }
    if (await TeachingAssignment.count({ where: { teacherId: person.user.id, divisionId: divs } })) return 'limited';
  }
  throw forbidden('No tenés acceso al perfil de esta persona.');
};

// ---------------- Qué datos de una persona ve cada uno ----------------

const FULL_USER_ATTRIBUTES = ['id', 'firstName', 'lastName', 'email', 'dni', 'phone', 'avatar', 'lastLogin', 'mustChangePassword'];
export const BASIC_USER_ATTRIBUTES = ['id', 'firstName', 'lastName', 'avatar'];

/** Datos de contacto (email, teléfono, DNI) solo con permiso CONTACT_INFO:READ. Los docentes ven nombre y foto. */
export const userAttrsFor = (session: SchoolSession) => (session.can(Entity.CONTACT_INFO, Action.READ) ? FULL_USER_ATTRIBUTES : BASIC_USER_ATTRIBUTES);
