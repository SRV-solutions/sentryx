import { Op, QueryTypes } from 'sequelize';
import {
  Enrollment,
  Division,
  StudentGuardian,
  Student,
  UserRole,
  TeachingAssignment,
  Level,
  User,
  sequelize,
} from '../models';
import type { Audience } from '../models/school/communication';
import { SchoolSession, canSeeDivision, studentDivisionId, divisionWhere } from './schoolSession';
import { forbidden, badRequest } from '../lib/http';
import { NON_STAFF_ROLES, AUDIENCE_TARGET_LABELS } from '../constants/school';
import { leadershipRoleCodes, roleLabel, roleRank } from './roleRegistry';
import { Entity, Action } from '../constants/permissions';
import { RoleCode, PRECEPTOR_ROLES } from '../constants/roles';

type Recipients = Map<number, number[]>;

/** Suma un destinatario sin perder los alumnos que ya tenía (una docente que además es madre recibe "por" su hijo). */
const merge = (out: Recipients, userId: number, studentIds: number[]) => {
  const prev = out.get(userId);
  out.set(userId, prev ? [...new Set([...prev, ...studentIds])] : [...studentIds]);
};

const canSendSchoolWide = (session: SchoolSession) => session.can(Entity.ANNOUNCEMENTS, Action.CREATE_SCHOOL_WIDE);

/** Verifica que el autor pueda dirigirse a esa audiencia según su rol y alcance. */
export const assertAudience = async (session: SchoolSession, a: Audience) => {
  const schoolWide = canSendSchoolWide(session);
  switch (a.type) {
    case 'SCHOOL':
      if (!schoolWide) throw forbidden('Solo conducción, secretaría o administración pueden enviar a toda la institución.');
      break;
    case 'STAFF':
      // Sin alcance institucional: solo el personal de los niveles a cargo (antes con ids vacíos llegaba a todo el colegio).
      if (!schoolWide && !session.scope.levelIds.length) throw forbidden('No podés enviar comunicados a todo el personal.');
      if (!schoolWide && !a.ids.every((id) => session.scope.levelIds.includes(id))) throw forbidden('Ese nivel está fuera de tu alcance.');
      break;
    case 'LEVEL':
      if (!a.ids.length) throw badRequest('Elegí al menos un nivel.');
      if (!session.scope.all && !a.ids.every((id) => session.scope.levelIds.includes(id))) throw forbidden('Ese nivel está fuera de tu alcance.');
      break;
    case 'DIVISION':
      if (!a.ids.length) throw badRequest('Elegí al menos una división.');
      if (!a.ids.every((id) => canSeeDivision(session, id))) throw forbidden('Alguna división está fuera de tu alcance.');
      break;
    case 'STUDENTS': {
      if (!a.ids.length) throw badRequest('Elegí al menos un alumno.');
      if (session.scope.all) break;
      // Una sola consulta: cada alumno con inscripción vigente en una división del alcance.
      const ids = [...new Set(a.ids)];
      const inScope = session.academicYearId && session.scope.divisionIds.length
        ? await Enrollment.count({
            where: { studentId: ids, academicYearId: session.academicYearId, status: 'ACTIVE', divisionId: session.scope.divisionIds },
            include: [{ model: Student, where: { schoolId: session.schoolId, active: true }, attributes: [] }],
          })
        : 0;
      if (inScope !== ids.length) throw forbidden('Algún alumno está fuera de tu alcance.');
      break;
    }
    case 'GUARDIANS': {
      if (!a.ids.length) throw badRequest('Elegí al menos una familia.');
      const reachable = await guardianStudents(session, a.ids);
      if (a.ids.some((id) => !reachable.has(id))) throw forbidden('Alguna familia está fuera de tu alcance.');
      break;
    }
    case 'USERS':
      if (!a.ids.length) throw badRequest('Elegí al menos una persona.');
      await assertReachable(session, a.ids);
      break;
  }
  if (a.extraUserIds?.length) await assertReachable(session, a.extraUserIds);
};

/**
 * Para cada familia elegida, sus hijos del colegio con inscripción vigente dentro del alcance del autor.
 * Devuelve Map<userId, studentIds[]>; una familia sin hijos alcanzables no aparece.
 */
const guardianStudents = async (session: SchoolSession, userIds: number[]) => {
  const out = new Map<number, number[]>();
  if (!session.academicYearId || !userIds.length) return out;
  const links = await StudentGuardian.findAll({
    where: { userId: userIds },
    attributes: ['userId', 'studentId'],
    include: [
      {
        model: Student,
        attributes: [],
        where: { schoolId: session.schoolId, active: true },
        include: [{ model: Enrollment, attributes: [], where: { academicYearId: session.academicYearId, status: 'ACTIVE' }, include: [{ model: Division, attributes: [], where: divisionWhere(session) }] }],
      },
    ],
    raw: true,
  });
  for (const l of links) merge(out, l.userId as number, [l.studentId as number]);
  return out;
};

/**
 * Cuentas de estudiante (Secundario) activas: legajo activo con inscripción vigente, usuario activo y rol ESTUDIANTE
 * activo en el colegio. Por legajos (audiencia ya validada) o por usuarios (con `scoped`: solo divisiones del alcance).
 */
const studentAccounts = async (session: SchoolSession, f: { studentIds?: number[]; userIds?: number[]; scoped?: boolean }) => {
  const list = f.studentIds ?? f.userIds ?? [];
  const scoped = !!f.scoped && !session.scope.all;
  if (!session.academicYearId || !list.length || (scoped && !session.scope.divisionIds.length)) return [] as Array<{ userId: number; studentId: number }>;
  return (await sequelize.query(
    `SELECT s."userId", s.id AS "studentId"
       FROM "Student" s
       JOIN "Enrollment" e ON e."studentId" = s.id AND e."academicYearId" = :yid AND e.status = 'ACTIVE'
       JOIN "User" u ON u.id = s."userId" AND u."isActive"
      WHERE s."schoolId" = :sid AND s.active AND ${f.studentIds ? 's.id' : 's."userId"'} IN (:list)
        ${scoped ? 'AND e."divisionId" IN (:divs)' : ''}
        AND EXISTS (SELECT 1 FROM "UserRole" r WHERE r."userId" = s."userId" AND r."schoolId" = :sid AND r.role = :role AND r.active)`,
    { replacements: { yid: session.academicYearId, sid: session.schoolId, list, divs: session.scope.divisionIds, role: RoleCode.ESTUDIANTE }, type: QueryTypes.SELECT }
  )) as Array<{ userId: number; studentId: number }>;
};

/**
 * Personas puntuales a las que el autor puede escribir (audiencia USERS y "Sumar más gente"):
 * personal activo del colegio → [], familia de alumnos del alcance → esos hijos, estudiante del alcance → [su legajo].
 * Quien no es alcanzable no aparece en el Map.
 */
export const reachableUsers = async (session: SchoolSession, userIds: number[]): Promise<Recipients> => {
  const out: Recipients = new Map();
  const ids = [...new Set(userIds)];
  if (!ids.length) return out;
  const [staff, families, students] = await Promise.all([
    UserRole.findAll({
      where: { userId: ids, schoolId: session.schoolId, active: true, role: { [Op.notIn]: NON_STAFF_ROLES } },
      include: [{ model: User, attributes: [], where: { isActive: true } }],
      attributes: ['userId'],
      raw: true,
    }),
    guardianStudents(session, ids),
    studentAccounts(session, { userIds: ids, scoped: true }),
  ]);
  staff.forEach((m) => merge(out, m.userId as number, []));
  families.forEach((studentIds, userId) => merge(out, userId, studentIds));
  students.forEach((s) => merge(out, s.userId, [s.studentId]));
  return out;
};

/** Igual que reachableUsers, pero si alguna persona está fuera del alcance corta con 403. */
export const assertReachable = async (session: SchoolSession, userIds: number[]) => {
  const reachable = await reachableUsers(session, userIds);
  if (userIds.some((id) => !reachable.has(id))) throw forbidden('Alguna de las personas elegidas está fuera de tu alcance.');
  return reachable;
};

/** Alumnos alcanzados por la audiencia (ciclo vigente). */
const audienceStudents = async (session: SchoolSession, a: Audience) => {
  if (a.type === 'STAFF' || a.type === 'USERS' || a.type === 'GUARDIANS' || !session.academicYearId) return [] as Array<{ studentId: number; divisionId: number }>;
  const divisionFilter =
    a.type === 'DIVISION'
      ? { divisionId: a.ids }
      : a.type === 'LEVEL'
        ? { divisionId: (await Division.findAll({ where: { levelId: a.ids, academicYearId: session.academicYearId }, attributes: ['id'], raw: true })).map((d) => d.id) }
        : {};
  const rows = await Enrollment.findAll({
    where: {
      academicYearId: session.academicYearId,
      status: 'ACTIVE',
      ...divisionFilter,
      ...(a.type === 'STUDENTS' ? { studentId: a.ids } : {}),
    },
    include: [{ model: Student, where: { schoolId: session.schoolId, active: true }, attributes: [] }],
    attributes: ['studentId', 'divisionId'],
    raw: true,
  });
  return rows.map((r) => ({ studentId: r.studentId as number, divisionId: r.divisionId as number }));
};

/**
 * Personal de ciertos niveles: roles con ese nivel, roles institucionales (sin nivel, salvo docentes) y docentes
 * que dictan en alguna división del nivel este ciclo. Sin niveles: todo el personal del colegio.
 */
const staffOf = async (session: SchoolSession, levelIds: number[] | null) =>
  (
    (await sequelize.query(
      `SELECT DISTINCT r."userId"
         FROM "UserRole" r JOIN "User" u ON u.id = r."userId" AND u."isActive"
        WHERE r."schoolId" = :sid AND r.active AND r.role NOT IN (:nonStaff)
          ${
            levelIds
              ? `AND (r."levelId" IN (:levels) OR (r."levelId" IS NULL AND r.role <> :docente)
                  OR (r.role = :docente AND EXISTS (SELECT 1 FROM "TeachingAssignment" ta JOIN "Division" d ON d.id = ta."divisionId"
                       WHERE ta."teacherId" = r."userId" AND d."levelId" IN (:levels) AND d."academicYearId" = :yid)))`
              : ''
          }`,
      { replacements: { sid: session.schoolId, nonStaff: NON_STAFF_ROLES, levels: levelIds?.length ? levelIds : [0], docente: RoleCode.DOCENTE, yid: session.academicYearId ?? 0 }, type: QueryTypes.SELECT }
    )) as Array<{ userId: number }>
  ).map((r) => r.userId);

/**
 * Resuelve destinatarios: familias y/o estudiantes con cuenta (según `target`), personal si corresponde y
 * personas sumadas a mano. Devuelve Map<userId, studentIds[]>.
 */
export const resolveRecipients = async (session: SchoolSession, a: Audience) => {
  const out: Recipients = new Map();
  if (a.type === 'GUARDIANS') {
    // Familias elegidas una por una: se les manda aunque tengan "no recibe comunicados" (la elección es explícita).
    (await guardianStudents(session, a.ids)).forEach((studentIds, userId) => merge(out, userId, studentIds));
  } else if (a.type === 'USERS') {
    (await reachableUsers(session, a.ids)).forEach((studentIds, userId) => merge(out, userId, studentIds));
  } else {
    const students = await audienceStudents(session, a);
    const target = a.target ?? 'FAMILIES';
    const studentIds = students.map((s) => s.studentId);
    if (studentIds.length && target !== 'STUDENTS') {
      const guardians = await StudentGuardian.findAll({ where: { studentId: studentIds, receivesCommunications: true }, attributes: ['userId', 'studentId'], raw: true });
      for (const g of guardians) merge(out, g.userId as number, [g.studentId as number]);
    }
    if (studentIds.length && target !== 'FAMILIES') {
      for (const s of await studentAccounts(session, { studentIds })) merge(out, s.userId, [s.studentId]);
    }

    if (a.type === 'STAFF' || a.type === 'SCHOOL' || a.includeStaff) {
      let staffIds: number[];
      if (a.type === 'SCHOOL') staffIds = await staffOf(session, null);
      else if (a.type === 'STAFF') {
        // Sin alcance institucional y sin niveles elegidos: los niveles a cargo (nunca todo el colegio).
        const levels = a.ids.length ? a.ids : canSendSchoolWide(session) ? null : session.scope.levelIds;
        staffIds = levels && !levels.length ? [] : await staffOf(session, levels);
      } else {
        const divisionIds = [...new Set(students.map((s) => s.divisionId))];
        staffIds = divisionIds.length ? (await TeachingAssignment.findAll({ where: { divisionId: divisionIds }, attributes: ['teacherId'], raw: true })).map((t) => t.teacherId as number) : [];
      }
      staffIds.forEach((id) => merge(out, id, []));
    }
  }
  if (a.extraUserIds?.length) (await reachableUsers(session, a.extraUserIds)).forEach((studentIds, userId) => merge(out, userId, studentIds));

  out.delete(session.userId);
  return out;
};

const STUDENT_BASED: Audience['type'][] = ['SCHOOL', 'LEVEL', 'DIVISION', 'STUDENTS'];

const baseLabel = async (session: SchoolSession, a: Audience) => {
  switch (a.type) {
    case 'SCHOOL':
      return 'Toda la institución';
    case 'STAFF':
      return a.ids.length ? `Personal · ${(await Level.findAll({ where: { id: a.ids, schoolId: session.schoolId }, attributes: ['name'] })).map((l) => l.name).join(', ')}` : 'Personal';
    case 'LEVEL':
      return (await Level.findAll({ where: { id: a.ids, schoolId: session.schoolId }, attributes: ['name'] })).map((l) => l.name).join(', ');
    case 'DIVISION':
      return (await Division.findAll({ where: { id: a.ids, schoolId: session.schoolId }, attributes: ['name'], order: [['name', 'ASC']] })).map((d) => d.name).join(', ');
    case 'STUDENTS': {
      const s = await Student.findAll({ where: { id: a.ids, schoolId: session.schoolId }, attributes: ['firstName', 'lastName'] });
      return s.length > 3 ? `${s.length} alumnos` : s.map((x) => `${x.firstName} ${x.lastName}`).join(', ');
    }
    case 'GUARDIANS': {
      const u = await User.findAll({ where: { id: a.ids }, attributes: ['firstName', 'lastName'], order: [['lastName', 'ASC']] });
      return u.length > 3 ? `${u.length} familias` : u.map((x) => `Familia ${x.lastName} (${x.firstName})`).join(', ');
    }
    case 'USERS': {
      if (a.ids.length > 3) return `${a.ids.length} personas`;
      const u = await User.findAll({ where: { id: a.ids }, attributes: ['firstName', 'lastName'], order: [['lastName', 'ASC']] });
      return u.map((x) => `${x.firstName} ${x.lastName}`).join(', ');
    }
  }
};

/** Texto legible del destinatario: "3º B · familias y estudiantes", "Ana Gómez, Juan Pérez", "Secundario +2 personas". */
export const audienceLabel = async (session: SchoolSession, a: Audience) => {
  let label = (await baseLabel(session, a)) ?? '';
  if (a.target && a.target !== 'FAMILIES' && STUDENT_BASED.includes(a.type)) label += ` · ${AUDIENCE_TARGET_LABELS[a.target]}`;
  const extras = new Set(a.extraUserIds ?? []).size;
  if (extras) label += ` +${extras} ${extras === 1 ? 'persona' : 'personas'}`;
  return label.length > 200 ? `${label.slice(0, 199)}…` : label;
};

/** ¿Puede elegir "Estudiantes" como destinatarios? Solo si tiene alguna división de Secundario (únicos con cuenta). */
export const canTargetStudents = async (session: SchoolSession) => {
  if (!session.academicYearId || (!session.scope.all && !session.scope.divisionIds.length)) return false;
  return (
    (await Division.count({ where: { ...divisionWhere(session), academicYearId: session.academicYearId }, include: [{ model: Level, where: { type: 'SECUNDARIO' }, attributes: [] }] })) > 0
  );
};

export interface PersonOption {
  userId: number;
  name: string;
  avatar: string | null;
  kind: 'STAFF' | 'FAMILY' | 'STUDENT';
  detail: string | null;
}

// Sin la extensión unaccent: se pliegan los acentos con translate() en SQL y con NFD en JS.
const ACCENTS = ['áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'];
const fold = (sqlExpr: string) => `lower(translate(${sqlExpr}, '${ACCENTS[0]}', '${ACCENTS[1]}'))`;
const foldJs = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const nameMatch = (first: string, last: string) => `(${fold(`${first} || ' ' || ${last}`)} LIKE :q OR ${fold(`${last} || ' ' || ${first}`)} LIKE :q)`;

/**
 * Buscador de "Personas" y "Sumar más gente": personal activo del colegio, familias de alumnos del alcance y
 * estudiantes con cuenta del alcance. Una consulta por tipo; quien es personal y familia aparece como personal.
 */
export const searchReachablePeople = async (session: SchoolSession, q: string, limit: number): Promise<PersonOption[]> => {
  const term = foldJs(q);
  const replacements = {
    sid: session.schoolId,
    uid: session.userId,
    yid: session.academicYearId ?? 0,
    q: `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    limit,
    nonStaff: NON_STAFF_ROLES,
    role: RoleCode.ESTUDIANTE,
    divs: session.scope.divisionIds.length ? session.scope.divisionIds : [0],
  };
  const scopeSql = session.scope.all ? '' : 'AND e."divisionId" IN (:divs)';
  const withYear = !!session.academicYearId;
  const [staff, families, students] = (await Promise.all([
    sequelize.query(
      `SELECT u.id AS "userId", u."firstName" || ' ' || u."lastName" AS name, u.avatar, array_agg(DISTINCT r.role) AS roles
         FROM "UserRole" r JOIN "User" u ON u.id = r."userId" AND u."isActive"
        WHERE r."schoolId" = :sid AND r.active AND r.role NOT IN (:nonStaff) AND u.id <> :uid AND ${nameMatch('u."firstName"', 'u."lastName"')}
        GROUP BY u.id ORDER BY u."lastName", u."firstName" LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    ),
    withYear
      ? sequelize.query(
          `SELECT u.id AS "userId", u."firstName" || ' ' || u."lastName" AS name, u.avatar,
                  string_agg(DISTINCT s."firstName" || ' ' || s."lastName" || ' · ' || d.name, ', ') AS kids
             FROM "StudentGuardian" g
             JOIN "User" u ON u.id = g."userId" AND u."isActive"
             JOIN "Student" s ON s.id = g."studentId" AND s."schoolId" = :sid AND s.active
             JOIN "Enrollment" e ON e."studentId" = s.id AND e."academicYearId" = :yid AND e.status = 'ACTIVE'
             JOIN "Division" d ON d.id = e."divisionId"
            WHERE g.active AND u.id <> :uid ${scopeSql}
              AND (${nameMatch('u."firstName"', 'u."lastName"')} OR ${nameMatch('s."firstName"', 's."lastName"')})
            GROUP BY u.id ORDER BY u."lastName", u."firstName" LIMIT :limit`,
          { replacements, type: QueryTypes.SELECT }
        )
      : [],
    withYear
      ? sequelize.query(
          `SELECT s."userId", s."firstName" || ' ' || s."lastName" AS name, u.avatar, d.name AS division
             FROM "Student" s
             JOIN "User" u ON u.id = s."userId" AND u."isActive"
             JOIN "Enrollment" e ON e."studentId" = s.id AND e."academicYearId" = :yid AND e.status = 'ACTIVE'
             JOIN "Division" d ON d.id = e."divisionId"
            WHERE s."schoolId" = :sid AND s.active AND s."userId" <> :uid ${scopeSql} AND ${nameMatch('s."firstName"', 's."lastName"')}
              AND EXISTS (SELECT 1 FROM "UserRole" r WHERE r."userId" = s."userId" AND r."schoolId" = :sid AND r.role = :role AND r.active)
            ORDER BY s."lastName", s."firstName" LIMIT :limit`,
          { replacements, type: QueryTypes.SELECT }
        )
      : [],
  ])) as [
    Array<{ userId: number; name: string; avatar: string | null; roles: string[] }>,
    Array<{ userId: number; name: string; avatar: string | null; kids: string }>,
    Array<{ userId: number; name: string; avatar: string | null; division: string }>,
  ];

  const seen = new Set<number>();
  const out: PersonOption[] = [];
  const push = (p: PersonOption) => !seen.has(p.userId) && (seen.add(p.userId), out.push(p));
  staff.forEach((s) => {
    const top = [...s.roles].sort((a, b) => roleRank(b) - roleRank(a))[0];
    push({ userId: s.userId, name: s.name, avatar: s.avatar, kind: 'STAFF', detail: top ? roleLabel(top) : null });
  });
  families.forEach((f) => push({ userId: f.userId, name: f.name, avatar: f.avatar, kind: 'FAMILY', detail: `Familia de ${f.kids}` }));
  students.forEach((s) => push({ userId: s.userId, name: s.name, avatar: s.avatar, kind: 'STUDENT', detail: `Estudiante · ${s.division}` }));
  // Primero los que empiezan con lo buscado; después, alfabético.
  const starts = (p: PersonOption) => (foldJs(p.name).startsWith(term) || foldJs(p.name.split(' ').slice(-1)[0] ?? '').startsWith(term) ? 0 : 1);
  return out.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name, 'es')).slice(0, limit);
};

export interface FamilyRow {
  userId: number;
  firstName: string;
  lastName: string;
  avatar: string | null;
  email: string | null;
  phone: string | null;
  receivesCommunications: boolean;
  students: Array<{ id: number; firstName: string; lastName: string; relationship: string; division: { id: number; name: string; gradeYear: number; levelId: number; level: string } | null }>;
}

/**
 * Listado completo de familias del alcance del autor (para elegir destinatarios una por una),
 * con filtros por nivel, grado/año y división y búsqueda por nombre de la familia o del alumno.
 */
export const listFamilies = async (session: SchoolSession, f: { q?: string; levelId?: number; gradeYear?: number; divisionId?: number }) => {
  if (!session.academicYearId) return [] as FamilyRow[];
  const contact = session.can(Entity.CONTACT_INFO, Action.READ);
  const links = await StudentGuardian.findAll({
    attributes: ['userId', 'studentId', 'relationship', 'receivesCommunications'],
    include: [
      { model: User, attributes: ['id', 'firstName', 'lastName', 'avatar', 'email', 'phone'], where: { isActive: true } },
      {
        model: Student,
        attributes: ['id', 'firstName', 'lastName'],
        where: { schoolId: session.schoolId, active: true },
        include: [
          {
            model: Enrollment,
            attributes: ['id'],
            where: { academicYearId: session.academicYearId, status: 'ACTIVE', ...(f.divisionId ? { divisionId: f.divisionId } : {}) },
            include: [
              {
                model: Division,
                attributes: ['id', 'name', 'gradeYear', 'levelId'],
                where: { ...divisionWhere(session), ...(f.levelId ? { levelId: f.levelId } : {}), ...(f.gradeYear ? { gradeYear: f.gradeYear } : {}) },
                include: [{ model: Level, attributes: ['name'] }],
              },
            ],
          },
        ],
      },
    ],
  });
  const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = f.q ? norm(f.q.trim()) : '';
  const byUser = new Map<number, FamilyRow>();
  for (const l of links) {
    const u = (l as StudentGuardian & { User?: User }).User!;
    const s = (l as StudentGuardian & { Student?: Student & { Enrollments?: Array<Enrollment & { Division?: Division & { Level?: Level } }> } }).Student!;
    const d = s.Enrollments?.[0]?.Division;
    const row = byUser.get(u.id) ?? {
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      avatar: u.avatar,
      email: contact ? u.email : null,
      phone: contact ? u.phone : null,
      receivesCommunications: true,
      students: [],
    };
    row.receivesCommunications = row.receivesCommunications && l.receivesCommunications;
    row.students.push({ id: s.id, firstName: s.firstName, lastName: s.lastName, relationship: l.relationship, division: d ? { id: d.id, name: d.name, gradeYear: d.gradeYear, levelId: d.levelId, level: d.Level?.name ?? '' } : null });
    byUser.set(u.id, row);
  }
  let rows = [...byUser.values()];
  if (q) rows = rows.filter((r) => norm(`${r.firstName} ${r.lastName} ${r.email ?? ''}`).includes(q) || r.students.some((s) => norm(`${s.firstName} ${s.lastName}`).includes(q)));
  rows.sort((a, b) => a.lastName.localeCompare(b.lastName, 'es') || a.firstName.localeCompare(b.firstName, 'es'));
  return rows;
};

export interface Contact {
  userId: number;
  name: string;
  role: string;
  detail: string | null;
  avatar: string | null;
}

/**
 * Con quién puede hablar una familia sobre un hijo: docentes de su división (con su materia),
 * preceptoría y conducción del nivel, y secretaría.
 */
export const contactsForGuardian = async (session: SchoolSession, studentId: number): Promise<Contact[]> => {
  const divisionId = await studentDivisionId(session, studentId);
  if (!divisionId) return [];
  const division = await Division.findByPk(divisionId, { attributes: ['id', 'levelId'] });
  const [teachers, staff] = await Promise.all([
    TeachingAssignment.findAll({
      where: { divisionId },
      include: [
        { model: User, as: 'Teacher', attributes: ['id', 'firstName', 'lastName', 'avatar'], where: { isActive: true } },
        { association: 'Subject', attributes: ['name'] },
      ],
    }),
    UserRole.findAll({
      where: {
        schoolId: session.schoolId,
        active: true,
        role: { [Op.in]: [...(await leadershipRoleCodes(session.schoolId)), ...PRECEPTOR_ROLES, 'SECRETARIO'] },
        [Op.or]: [{ levelId: null }, { levelId: division!.levelId }],
      },
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'avatar'], where: { isActive: true } }],
    }),
  ]);

  const map = new Map<number, Contact>();
  for (const m of staff) {
    if (m.role === RoleCode.PRECEPTOR && m.divisionIds?.length && !m.divisionIds.includes(divisionId)) continue;
    const u = (m as UserRole & { User?: User }).User!;
    map.set(u.id, { userId: u.id, name: `${u.firstName} ${u.lastName}`, role: roleLabel(m.role), detail: m.title, avatar: u.avatar });
  }
  for (const t of teachers) {
    const u = (t as TeachingAssignment & { Teacher?: User }).Teacher!;
    const subject = (t as TeachingAssignment & { Subject?: { name: string } }).Subject?.name ?? null;
    const prev = map.get(u.id);
    if (prev?.role === 'Docente') prev.detail = [prev.detail, subject].filter(Boolean).join(' · ');
    else if (!prev) map.set(u.id, { userId: u.id, name: `${u.firstName} ${u.lastName}`, role: 'Docente', detail: subject, avatar: u.avatar });
  }
  const order = ['Docente', 'Preceptoría', 'Dirección', 'Rectoría', 'Vicedirección', 'Secretaría'];
  return [...map.values()].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name, 'es'));
};

/** Familias de un alumno y, si tiene cuenta activa (Secundario), el propio estudiante. Para que el personal inicie una conversación. */
export const guardiansOf = async (studentId: number): Promise<Contact[]> => {
  const [links, student] = await Promise.all([
    StudentGuardian.findAll({
      where: { studentId },
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'avatar'], where: { isActive: true } }],
    }),
    Student.findByPk(studentId, { attributes: ['userId', 'schoolId'] }),
  ]);
  const out: Contact[] = links.map((l) => {
    const u = (l as StudentGuardian & { User?: User }).User!;
    return { userId: u.id, name: `${u.firstName} ${u.lastName}`, role: 'Familia', detail: l.relationship, avatar: u.avatar };
  });
  if (student?.userId && (await UserRole.count({ where: { userId: student.userId, schoolId: student.schoolId, role: RoleCode.ESTUDIANTE, active: true } }))) {
    const u = await User.findOne({ where: { id: student.userId, isActive: true }, attributes: ['id', 'firstName', 'lastName', 'avatar'] });
    if (u) out.push({ userId: u.id, name: `${u.firstName} ${u.lastName}`, role: 'Estudiante', detail: null, avatar: u.avatar });
  }
  return out;
};

/** Un estudiante solo puede escribirles a sus docentes y a la preceptoría de su división. */
export const contactsForStudent = async (session: SchoolSession, studentId: number): Promise<Contact[]> =>
  (await contactsForGuardian(session, studentId)).filter((c) => c.role === 'Docente' || c.role === 'Preceptoría');
