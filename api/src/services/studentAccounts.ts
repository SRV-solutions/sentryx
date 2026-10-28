import { Op, Transaction } from 'sequelize';
import { Division, Enrollment, Level, Student, User, UserRole } from '../models';
import { RoleCode } from '../constants/roles';
import { findOrCreatePerson } from './accounts';
import { audit } from './audit';
import { HttpError } from '../lib/http';

/**
 * CUENTAS AUTOMÁTICAS DE ESTUDIANTES (solo Secundario): se crean el día que el alumno entra a Secundario
 * (alta, importación, cambio de curso, reincorporación o promoción). Ingresa con su DNI; el email es opcional
 * y lo carga después el estudiante (o su familia, solo si falta). Nunca hace fallar la operación que la dispara:
 * si no se puede (sin DNI, DNI de un adulto), devuelve 'skipped' con el motivo.
 */

export type StudentAccountStatus = 'created' | 'reactivated' | 'exists' | 'skipped';
export interface EnsureAccountResult {
  status: StudentAccountStatus;
  user?: User;
  /** Solo si se creó el usuario: hay que entregarla (el email técnico no recibe correos). */
  tempPassword?: string;
  reason?: string;
}

/** Credencial para la hoja imprimible (CredentialsSheet del cliente). */
export interface StudentCredential {
  name: string;
  login: string;
  tempPassword: string;
  email: null;
  student: string;
}

/** Motivos de "no corresponde" (no es Secundario o no está inscripto): no se informan como cuenta salteada. */
const NOT_SECONDARY = 'no es de Secundario';
const NOT_ENROLLED = 'sin inscripción en el ciclo';

export const ADULT_DNI_REASON = 'ese DNI ya pertenece a una cuenta de personal o familia. Revisá el DNI del alumno.';

/** La persona tiene algún rol que no es de estudiante (el DNI cargado es el de un adulto). */
export const hasAdultRole = async (userId: number, transaction?: Transaction) =>
  (await UserRole.count({ where: { userId, role: { [Op.ne]: RoleCode.ESTUDIANTE } }, transaction })) > 0;

/** Rol ESTUDIANTE en la escuela: lo crea o lo reactiva. */
export const ensureStudentRole = async (userId: number, schoolId: number, transaction?: Transaction) => {
  const [m, created] = await UserRole.findOrCreate({
    where: { userId, schoolId, role: RoleCode.ESTUDIANTE },
    defaults: { userId, schoolId, role: RoleCode.ESTUDIANTE, levelId: null, title: null },
    transaction,
  });
  if (created) return 'created' as const;
  if (!m.active) {
    await m.update({ active: true }, { transaction });
    return 'reactivated' as const;
  }
  return 'exists' as const;
};

/** Tipo de nivel de una división, con caché por división (importación y promoción repiten divisiones). */
export const divisionLevelType = async (divisionId: number, cache: Map<number, string>, transaction?: Transaction) => {
  if (cache.has(divisionId)) return cache.get(divisionId)!;
  const d = (await Division.findByPk(divisionId, { attributes: ['id'], include: [{ model: Level, attributes: ['type'] }], transaction })) as (Division & { Level?: Level }) | null;
  const type = d?.Level?.type ?? '';
  cache.set(divisionId, type);
  return type;
};

export const accountName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName} (estudiante)`;

/**
 * Asegura la cuenta del estudiante si su inscripción ACTIVA está en Secundario. Corre dentro de la transacción
 * de la inscripción (`divisionId` = curso recién asignado; sin él se busca la inscripción activa del ciclo).
 * - Ya tiene usuario: solo se asegura el rol ESTUDIANTE activo (sin contraseña nueva).
 * - Sin usuario: se crea con su DNI (o se vincula el existente con ese DNI, si no es de un adulto).
 */
export const ensureStudentAccount = async (opts: {
  schoolId: number;
  actorUserId: number;
  student: Student;
  transaction: Transaction;
  divisionId?: number;
  academicYearId?: number | null;
  levelTypes?: Map<number, string>;
}): Promise<EnsureAccountResult> => {
  const { schoolId, actorUserId, student, transaction } = opts;
  const cache = opts.levelTypes ?? new Map<number, string>();
  let divisionId = opts.divisionId;
  if (!divisionId) {
    const e = await Enrollment.findOne({ where: { studentId: student.id, academicYearId: opts.academicYearId ?? 0, status: 'ACTIVE' }, attributes: ['divisionId'], transaction });
    if (!e) return { status: 'skipped', reason: NOT_ENROLLED };
    divisionId = e.divisionId as number;
  }
  if ((await divisionLevelType(divisionId, cache, transaction)) !== 'SECUNDARIO') return { status: 'skipped', reason: NOT_SECONDARY };

  if (student.userId) {
    const user = await User.findByPk(student.userId, { transaction });
    if (user) {
      const role = await ensureStudentRole(user.id, schoolId, transaction);
      if (role === 'exists') return { status: 'exists', user };
      await audit({ schoolId, userId: actorUserId, entity: 'Student', entityId: student.id, action: 'enable-account', after: { userId: user.id, auto: true } }, transaction);
      return { status: 'reactivated', user };
    }
  }
  if (!student.dni) return { status: 'skipped', reason: 'sin DNI' };

  let r: Awaited<ReturnType<typeof findOrCreatePerson>>;
  try {
    r = await findOrCreatePerson({ firstName: student.firstName, lastName: student.lastName, dni: student.dni, email: null }, transaction);
  } catch (err) {
    // Errores de datos (DNI de otra persona, DNI mal escrito): no frenan el alta; un error de la base sí.
    if (err instanceof HttpError) return { status: 'skipped', reason: err.message };
    throw err;
  }
  if (!r.created && (await hasAdultRole(r.user.id, transaction))) return { status: 'skipped', reason: `${student.firstName}: ${ADULT_DNI_REASON}` };
  await student.update({ userId: r.user.id }, { transaction });
  await ensureStudentRole(r.user.id, schoolId, transaction);
  await audit({ schoolId, userId: actorUserId, entity: 'Student', entityId: student.id, action: 'create-account', after: { userId: r.user.id, auto: true } }, transaction);
  // Usuario existente con ese DNI (ej: estudiante que viene de otra escuela de Sentryx): ya tiene su contraseña.
  return r.tempPassword ? { status: 'created', user: r.user, tempPassword: r.tempPassword } : { status: 'reactivated', user: r.user };
};

/** Credencial a entregar (solo si se creó con contraseña temporal). */
export const credentialOf = (res: EnsureAccountResult, student: { firstName: string; lastName: string }, label: string): StudentCredential | null =>
  res.status === 'created' && res.user && res.tempPassword
    ? { name: accountName(student), login: res.user.dni ?? res.user.email, tempPassword: res.tempPassword, email: null, student: label }
    : null;

export const notApplicable = (res: EnsureAccountResult | null) => !res || (res.status === 'skipped' && (res.reason === NOT_SECONDARY || res.reason === NOT_ENROLLED));

/** Lo que vuelve al cliente (sin usuario ni contraseña). null = no corresponde cuenta (no es de Secundario). */
export const accountSummary = (res: EnsureAccountResult | null) =>
  !res || notApplicable(res) ? null : { status: res.status, ...(res.reason ? { reason: res.reason } : {}) };
