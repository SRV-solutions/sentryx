import { UserRole, Level, School, sequelize, User } from '../models';
import { RoleCode, SchoolRole, STAFF_ROLES, isStaffRole } from '../constants/roles';
import { roleLabel, isKnownSchoolRole, customRolesOf } from './roleRegistry';
import { SchoolSession, invalidateSchoolSession } from './schoolSession';
import { findOrCreatePerson, sendWelcome, PersonInput, isTechEmail } from './accounts';
import { assertCanGrant, assertSelfRole } from './access';
import { touchAccess } from './billing';
import { audit } from './audit';
import { badRequest, conflict, forbidden } from '../lib/http';

/** Nombre del colegio para los emails de bienvenida. */
export const schoolName = async (schoolId: number) => (await School.findByPk(schoolId, { attributes: ['name'] }))?.name ?? 'Tu institución';

export interface StaffMemberInput extends PersonInput {
  role: SchoolRole;
  levelId?: number | null;
  divisionIds?: number[];
  title?: string | null;
}

/**
 * Da de alta a una persona del personal con un rol (o le agrega el rol si ya tiene cuenta).
 * Aplica la jerarquía (solo roles de menor rango) y el alcance de quien la crea.
 */
export const grantStaffRole = async (session: SchoolSession, input: StaffMemberInput) => {
  const { role, levelId = null, divisionIds = [], title = null, ...personData } = input;
  if (levelId && !(await Level.count({ where: { id: levelId, schoolId: session.schoolId } }))) throw badRequest('Nivel inválido.');
  if (!isKnownSchoolRole(role, session.schoolId) || !isStaffRole(role)) throw badRequest('Rol desconocido para este colegio.');
  assertCanGrant(session, role, levelId, divisionIds);

  const result = await sequelize.transaction(async (transaction) => {
    const { user, tempPassword } = await findOrCreatePerson(personData, transaction);
    // Roles propios: solo de menor jerarquía (el superadmin, cualquiera).
    if (user.id === session.userId) assertSelfRole(session, role);
    const [userRole, created] = await UserRole.findOrCreate({
      where: { userId: user.id, schoolId: session.schoolId, role, levelId },
      defaults: { userId: user.id, schoolId: session.schoolId, role, levelId, divisionIds, title },
      transaction,
    });
    if (!created && userRole.active) throw conflict(`${user.firstName} ${user.lastName} ya tiene el rol ${roleLabel(role)}${levelId ? ' en ese nivel' : ''}.`);
    if (!created) await userRole.update({ active: true, divisionIds, title }, { transaction });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'UserRole', entityId: userRole.id, action: 'grant', after: { userId: user.id, role, levelId } }, transaction);
    return { user, tempPassword, userRole };
  });

  invalidateSchoolSession(result.user.id);
  touchAccess(session.schoolId, [result.user.id]);
  return result;
};

/** Credencial a entregar (solo si se creó la cuenta). */
export const credentialOf = (user: User, tempPassword: string) => ({
  name: `${user.firstName} ${user.lastName}`,
  login: user.dni ?? user.email,
  tempPassword,
  email: isTechEmail(user.email) ? null : user.email,
});

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Rol a partir de lo que escribieron en el CSV: código ("DOCENTE") o nombre ("Preceptoría", "preceptor"). */
export const parseRole = (text: string, schoolId?: number): SchoolRole | null => {
  const value = normalize(text).replace(/\s+/g, '_');
  const byCode = STAFF_ROLES.find((role) => role.toLowerCase() === value);
  if (byCode) return byCode;
  // Roles personalizados del colegio: por nombre exacto ("Coordinador de deportes").
  const custom = schoolId ? customRolesOf(schoolId).find((r) => normalize(r.name) === normalize(text) || r.code.toLowerCase() === value) : null;
  if (custom) return custom.code as SchoolRole;
  const synonyms: Record<string, SchoolRole> = {
    representante: RoleCode.REPRESENTANTE_LEGAL, directora: RoleCode.DIRECTOR, director: RoleCode.DIRECTOR, direccion: RoleCode.DIRECTOR,
    vicedirectora: RoleCode.VICEDIRECTOR, vicedireccion: RoleCode.VICEDIRECTOR, rectora: RoleCode.RECTOR, rector: RoleCode.RECTOR, rectoria: RoleCode.RECTOR,
    secretaria: RoleCode.SECRETARIO, secretario: RoleCode.SECRETARIO, administracion: RoleCode.ADMINISTRACION, administrativo: RoleCode.ADMINISTRACION,
    administrativa: RoleCode.ADMINISTRACION, preceptora: RoleCode.PRECEPTOR, preceptor: RoleCode.PRECEPTOR, preceptoria: RoleCode.PRECEPTOR,
    coordinador: RoleCode.COORDINADOR, coordinadora: RoleCode.COORDINADOR, coordinacion: RoleCode.COORDINADOR, jefatura: RoleCode.JEFE_PRECEPTORES, jefe: RoleCode.JEFE_PRECEPTORES, jefa: RoleCode.JEFE_PRECEPTORES,
    docente: RoleCode.DOCENTE, profesor: RoleCode.DOCENTE, profesora: RoleCode.DOCENTE, maestra: RoleCode.DOCENTE, maestro: RoleCode.DOCENTE,
  };
  return synonyms[value.split('_')[0]] ?? null;
};

/** Nivel a partir del nombre del CSV ("Secundario", "primaria", "inicial"). */
export const findLevelId = async (schoolId: number, text: string | null | undefined) => {
  if (!text?.trim()) return null;
  const wanted = normalize(text).slice(0, 5);
  const levels = await Level.findAll({ where: { schoolId }, attributes: ['id', 'name', 'type'] });
  const match = levels.find((level) => normalize(level.name).startsWith(wanted) || level.type.toLowerCase().startsWith(wanted));
  if (!match) throw badRequest(`Nivel "${text}" inexistente.`);
  return match.id;
};

