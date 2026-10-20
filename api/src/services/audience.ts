import { Op } from 'sequelize';
import {
  Enrollment,
  Division,
  StudentGuardian,
  Student,
  UserRole,
  TeachingAssignment,
  Level,
  User,
} from '../models';
import type { Audience } from '../models/school/communication';
import { SchoolSession, canSeeDivision, studentDivisionId, divisionWhere } from './schoolSession';
import { forbidden, badRequest } from '../lib/http';
import { NON_STAFF_ROLES } from '../constants/school';
import { leadershipRoleCodes, roleLabel } from './roleRegistry';
import { Entity, Action } from '../constants/permissions';
import { RoleCode, PRECEPTOR_ROLES } from '../constants/roles';

/** Verifica que el autor pueda dirigirse a esa audiencia según su rol y alcance. */
export const assertAudience = async (session: SchoolSession, a: Audience) => {
  const schoolWide = session.can(Entity.ANNOUNCEMENTS, Action.CREATE_SCHOOL_WIDE);
  switch (a.type) {
    case 'SCHOOL':
      if (!schoolWide) throw forbidden('Solo conducción, secretaría o administración pueden enviar a toda la institución.');
      return;
    case 'STAFF':
      if (!schoolWide && !session.scope.levelIds.length) throw forbidden('No podés enviar comunicados a todo el personal.');
      return;
    case 'LEVEL':
      if (!a.ids.length) throw badRequest('Elegí al menos un nivel.');
      if (!session.scope.all && !a.ids.every((id) => session.scope.levelIds.includes(id))) throw forbidden('Ese nivel está fuera de tu alcance.');
      return;
    case 'DIVISION':
      if (!a.ids.length) throw badRequest('Elegí al menos una división.');
      if (!a.ids.every((id) => canSeeDivision(session, id))) throw forbidden('Alguna división está fuera de tu alcance.');
      return;
    case 'STUDENTS':
      if (!a.ids.length) throw badRequest('Elegí al menos un alumno.');
      if (session.scope.all) return;
      for (const id of a.ids) {
        const div = await studentDivisionId(session, id);
        if (!div || !canSeeDivision(session, div)) throw forbidden('Algún alumno está fuera de tu alcance.');
      }
      return;
    case 'GUARDIANS': {
      if (!a.ids.length) throw badRequest('Elegí al menos una familia.');
      const reachable = await guardianStudents(session, a.ids);
      if (a.ids.some((id) => !reachable.has(id))) throw forbidden('Alguna familia está fuera de tu alcance.');
    }
  }
};

/**
 * Para cada familia elegida, sus hijos del colegio con inscripción vigente dentro del alcance del autor.
 * Devuelve Map<userId, studentIds[]>; una familia sin hijos alcanzables no aparece.
 */
const guardianStudents = async (session: SchoolSession, userIds: number[]) => {
  const out = new Map<number, number[]>();
  if (!session.academicYearId) return out;
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
  for (const l of links) {
    const list = out.get(l.userId as number) ?? [];
    list.push(l.studentId as number);
    out.set(l.userId as number, list);
  }
  return out;
};

/** Alumnos alcanzados por la audiencia (ciclo vigente). */
const audienceStudents = async (session: SchoolSession, a: Audience) => {
  if (a.type === 'STAFF' || !session.academicYearId) return [] as Array<{ studentId: number; divisionId: number }>;
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
 * Resuelve destinatarios: familias (con el/los alumnos por los que reciben) y, si corresponde, personal.
 * Devuelve Map<userId, studentIds[]>.
 */
export const resolveRecipients = async (session: SchoolSession, a: Audience) => {
  const out = new Map<number, number[]>();
  // Familias elegidas una por una: se les manda aunque tengan "no recibe comunicados" (la elección es explícita).
  if (a.type === 'GUARDIANS') {
    const chosen = await guardianStudents(session, a.ids);
    chosen.forEach((studentIds, userId) => out.set(userId, studentIds));
    out.delete(session.userId);
    return out;
  }
  const students = await audienceStudents(session, a);

  if (students.length) {
    const guardians = await StudentGuardian.findAll({
      where: { studentId: students.map((s) => s.studentId), receivesCommunications: true },
      attributes: ['userId', 'studentId'],
      raw: true,
    });
    for (const g of guardians) {
      const list = out.get(g.userId as number) ?? [];
      list.push(g.studentId as number);
      out.set(g.userId as number, list);
    }
  }

  if (a.type === 'STAFF' || a.type === 'SCHOOL' || a.includeStaff) {
    let staffIds: number[] = [];
    if (a.type === 'STAFF' || a.type === 'SCHOOL') {
      const levelFilter = a.type === 'STAFF' && a.ids.length ? { [Op.or]: [{ levelId: null }, { levelId: a.ids }] } : {};
      staffIds = (
        await UserRole.findAll({ where: { schoolId: session.schoolId, active: true, role: { [Op.notIn]: NON_STAFF_ROLES }, ...levelFilter }, attributes: ['userId'], raw: true })
      ).map((m) => m.userId as number);
    } else {
      const divisionIds = [...new Set(students.map((s) => s.divisionId))];
      const teachers = await TeachingAssignment.findAll({ where: { divisionId: divisionIds }, attributes: ['teacherId'], raw: true });
      staffIds = teachers.map((t) => t.teacherId as number);
    }
    staffIds.forEach((id) => !out.has(id) && out.set(id, []));
  }

  out.delete(session.userId);
  return out;
};

export const audienceLabel = async (session: SchoolSession, a: Audience) => {
  switch (a.type) {
    case 'SCHOOL':
      return 'Toda la institución';
    case 'STAFF':
      return 'Personal';
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
  }
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
