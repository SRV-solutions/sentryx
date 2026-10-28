import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize, StudentGuardian, User } from '../models';
import { SchoolSession } from './schoolSession';
import { conflict } from '../lib/http';
import { Entity, Action } from '../constants/permissions';

/**
 * Emails de los estudiantes de Secundario (Alertas → Sin email). Se calcula en el momento: no hay filas que
 * mantener sincronizadas. Sin email pueden ingresar con su DNI y cambiar la contraseña, pero no recuperarla.
 * Con `status: 'present' | 'all'` la conducción revisa los emails cargados y pide cambiar los inventados.
 */

export type EmailStatusFilter = 'missing' | 'present' | 'all';

export interface NoEmailRow {
  studentId: number;
  firstName: string;
  lastName: string;
  division: { id: number; name: string };
  account: 'NONE' | 'NO_EMAIL' | 'HAS_EMAIL';
  userId: number | null;
  login: string | null;
  hasEmail: boolean;
  /** Email real: solo con contact_info:read (si no, null aunque tenga; `hasEmail` lo dice igual). */
  email: string | null;
  guardians: Array<{ userId: number; name: string; relationship: string | null; hasEmail: boolean }>;
  noEmailNoticeAt: string | null;
  emailChangeRequestedAt: string | null;
  emailChangeReason: string | null;
}

/** Mismo alcance que las alertas: toda la escuela o las divisiones del usuario (con el selector de nivel aplicado). */
const scopeReplacements = (session: SchoolSession) => ({
  all: session.scope.all,
  divs: session.scope.divisionIds.length ? session.scope.divisionIds : [0],
});

const BASE_FROM = `
  FROM "Student" s
  JOIN "Enrollment" e ON e."studentId" = s.id AND e."academicYearId" = :yid AND e.status = 'ACTIVE'
  JOIN "Division" d ON d.id = e."divisionId"
  JOIN "Level" l ON l.id = d."levelId" AND l.type = 'SECUNDARIO'
  LEFT JOIN "User" u ON u.id = s."userId"`;

const NO_EMAIL_SQL = `(u.id IS NULL OR u.email LIKE '%@sin-email.local')`;

/**
 * Una sola consulta: alumno + curso + cuenta + familias (json_agg). `status` (por defecto 'missing'): sin cuenta
 * o sin email real; 'present': con email real; 'all': todos.
 */
export const listStudentEmails = async (
  session: SchoolSession,
  filter: { divisionId?: number; studentIds?: number[]; status?: EmailStatusFilter } = {}
): Promise<NoEmailRow[]> => {
  if (!session.academicYearId) return [];
  const status = filter.status ?? 'missing';
  return (await sequelize.query(
    `SELECT s.id AS "studentId", s."firstName", s."lastName", s."noEmailNoticeAt", s."emailChangeRequestedAt", s."emailChangeReason",
            json_build_object('id', d.id, 'name', d.name) AS division,
            CASE WHEN u.id IS NULL THEN 'NONE' WHEN u.email LIKE '%@sin-email.local' THEN 'NO_EMAIL' ELSE 'HAS_EMAIL' END AS account,
            NOT ${NO_EMAIL_SQL} AS "hasEmail",
            CASE WHEN :showEmail AND NOT ${NO_EMAIL_SQL} THEN u.email END AS email,
            u.id AS "userId", COALESCE(u.dni, u.email) AS login,
            COALESCE(json_agg(json_build_object('userId', gu.id, 'name', gu."firstName" || ' ' || gu."lastName", 'relationship', g.relationship,
                       'hasEmail', gu.email NOT LIKE '%@sin-email.local') ORDER BY g."isPrimary" DESC, gu."lastName") FILTER (WHERE gu.id IS NOT NULL), '[]') AS guardians
     ${BASE_FROM}
     LEFT JOIN "StudentGuardian" g ON g."studentId" = s.id AND g.active
     LEFT JOIN "User" gu ON gu.id = g."userId" AND gu."isActive"
     WHERE s."schoolId" = :sid AND s.active
       AND (:status = 'all' OR (:status = 'missing') = ${NO_EMAIL_SQL})
       AND (:all OR e."divisionId" IN (:divs))
       AND (:anyDivision OR e."divisionId" = :divisionId)
       AND (:anyStudent OR s.id IN (:studentIds))
     GROUP BY s.id, d.id, u.id
     ORDER BY d.name, s."lastName", s."firstName"`,
    {
      replacements: {
        sid: session.schoolId,
        yid: session.academicYearId,
        status,
        showEmail: session.can(Entity.CONTACT_INFO, Action.READ),
        ...scopeReplacements(session),
        anyDivision: !filter.divisionId,
        divisionId: filter.divisionId ?? 0,
        anyStudent: !filter.studentIds,
        studentIds: filter.studentIds?.length ? filter.studentIds : [0],
      },
      type: QueryTypes.SELECT,
    }
  )) as NoEmailRow[];
};

/** Sin cuenta o sin email real (avisos a las familias). */
export const listStudentsWithoutEmail = (session: SchoolSession, filter: { divisionId?: number; studentIds?: number[] } = {}) =>
  listStudentEmails(session, { ...filter, status: 'missing' });

/** Para el inicio: cuentas de estudiante sin email (las que no pueden recuperar la contraseña). */
export const countStudentsWithoutEmail = async (session: SchoolSession) => {
  if (!session.academicYearId) return 0;
  const [row] = (await sequelize.query(
    `SELECT COUNT(DISTINCT s.id)::int AS count ${BASE_FROM}
      WHERE s."schoolId" = :sid AND s.active AND u.email LIKE '%@sin-email.local' AND (:all OR e."divisionId" IN (:divs))`,
    { replacements: { sid: session.schoolId, yid: session.academicYearId, ...scopeReplacements(session) }, type: QueryTypes.SELECT }
  )) as Array<{ count: number }>;
  return row?.count ?? 0;
};

/**
 * El email tiene que ser propio del estudiante: el caso típico es cargar el de la mamá, que ya lo usa su cuenta.
 * Se valida antes de escribir para dar un mensaje claro (el índice único igual lo garantiza).
 * La tabla User es de toda la plataforma y a esto llegan familias y estudiantes: el mensaje NO dice de quién es el
 * email (si no, cualquiera averiguaría el nombre detrás de cualquier dirección). Solo se nombra a la persona cuando
 * es familia de este mismo estudiante (quien carga ya la conoce y el aviso ayuda: "ese es el de tu mamá").
 */
export const assertEmailFree = async (
  email: string,
  studentName: string,
  owner: { userId: number | null; dni?: string | null; studentId: number },
  transaction?: Transaction
) => {
  const other = await User.findOne({ where: { email, ...(owner.userId ? { id: { [Op.ne]: owner.userId } } : {}) }, attributes: ['id', 'firstName', 'lastName', 'dni'], transaction });
  if (!other) return;
  // Misma persona (cuenta anterior del alumno con su DNI): no es un choque.
  if (owner.dni && other.dni === owner.dni) return;
  const isOwnGuardian = await StudentGuardian.count({ where: { studentId: owner.studentId, userId: other.id }, transaction });
  if (isOwnGuardian) throw conflict(`Ese email ya lo usa la cuenta de ${other.firstName} ${other.lastName}. Usá uno propio del estudiante (${studentName}).`);
  throw conflict(`Ese email ya está en uso por otra cuenta. Usá uno propio del estudiante (${studentName}).`);
};
