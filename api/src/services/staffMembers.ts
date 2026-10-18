import { UserRole, Level, School, sequelize, User } from '../models';
import { RoleCode, SchoolRole, ROLE_LABELS, STAFF_ROLES } from '../constants/roles';
import { SchoolSession, invalidateSchoolSession } from './schoolSession';
import { findOrCreatePerson, sendWelcome, PersonInput, isTechEmail } from './accounts';
import { assertCanGrant } from './access';
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
  assertCanGrant(session, role, levelId, divisionIds);

  const result = await sequelize.transaction(async (transaction) => {
    const { user, tempPassword } = await findOrCreatePerson(personData, transaction);
    // Nadie se otorga roles a sí mismo (salvo la Representante Legal / el superadmin).
    if (user.id === session.userId && !session.superAdmin && !session.roles.includes(RoleCode.REPRESENTANTE_LEGAL)) {
      throw forbidden('No podés otorgarte un rol a vos mismo.');
    }
    const [userRole, created] = await UserRole.findOrCreate({
      where: { userId: user.id, schoolId: session.schoolId, role, levelId },
      defaults: { userId: user.id, schoolId: session.schoolId, role, levelId, divisionIds, title },
      transaction,
    });
    if (!created && userRole.active) throw conflict(`${user.firstName} ${user.lastName} ya tiene el rol ${ROLE_LABELS[role]}${levelId ? ' en ese nivel' : ''}.`);
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
export const parseRole = (text: string): SchoolRole | null => {
  const value = normalize(text).replace(/\s+/g, '_');
  const byCode = STAFF_ROLES.find((role) => role.toLowerCase() === value);
  if (byCode) return byCode;
  const synonyms: Record<string, SchoolRole> = {
    representante: RoleCode.REPRESENTANTE_LEGAL, directora: RoleCode.DIRECTOR, director: RoleCode.DIRECTOR, direccion: RoleCode.DIRECTOR,
    vicedirectora: RoleCode.VICEDIRECTOR, vicedireccion: RoleCode.VICEDIRECTOR, rectora: RoleCode.RECTOR, rector: RoleCode.RECTOR, rectoria: RoleCode.RECTOR,
    secretaria: RoleCode.SECRETARIO, secretario: RoleCode.SECRETARIO, administracion: RoleCode.ADMINISTRACION, administrativo: RoleCode.ADMINISTRACION,
    administrativa: RoleCode.ADMINISTRACION, preceptora: RoleCode.PRECEPTOR, preceptor: RoleCode.PRECEPTOR, preceptoria: RoleCode.PRECEPTOR,
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

