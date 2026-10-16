import { Op } from 'sequelize';
import {
  Enrollment,
  Division,
  StudentGuardian,
  Student,
  Membership,
  TeachingAssignment,
  Level,
  User,
} from '../../models';
import type { Audience } from '../../models/school/communication';
import { SchoolContext, canSeeDivision, studentDivisionId } from '../context';
import { forbidden, badRequest } from '../../lib/http';
import { LEADERSHIP_ROLES, ROLE_LABELS, SchoolRole } from '../constants';

/** Verifica que el autor pueda dirigirse a esa audiencia según su rol y alcance. */
export const assertAudience = async (ctx: SchoolContext, a: Audience) => {
  const schoolWide = ctx.permissions.has('announcements.publish.school');
  switch (a.type) {
    case 'SCHOOL':
      if (!schoolWide) throw forbidden('Solo conducción, secretaría o administración pueden enviar a toda la institución.');
      return;
    case 'STAFF':
      if (!schoolWide && !ctx.scope.levelIds.length) throw forbidden('No podés enviar comunicados a todo el personal.');
      return;
    case 'LEVEL':
      if (!a.ids.length) throw badRequest('Elegí al menos un nivel.');
      if (!ctx.scope.all && !a.ids.every((id) => ctx.scope.levelIds.includes(id))) throw forbidden('Ese nivel está fuera de tu alcance.');
      return;
    case 'DIVISION':
      if (!a.ids.length) throw badRequest('Elegí al menos una división.');
      if (!a.ids.every((id) => canSeeDivision(ctx, id))) throw forbidden('Alguna división está fuera de tu alcance.');
      return;
    case 'STUDENTS':
      if (!a.ids.length) throw badRequest('Elegí al menos un alumno.');
      if (ctx.scope.all) return;
      for (const id of a.ids) {
        const div = await studentDivisionId(ctx, id);
        if (!div || !canSeeDivision(ctx, div)) throw forbidden('Algún alumno está fuera de tu alcance.');
      }
  }
};

/** Alumnos alcanzados por la audiencia (ciclo vigente). */
const audienceStudents = async (ctx: SchoolContext, a: Audience) => {
  if (a.type === 'STAFF' || !ctx.academicYearId) return [] as Array<{ studentId: number; divisionId: number }>;
  const divisionFilter =
    a.type === 'DIVISION'
      ? { divisionId: a.ids }
      : a.type === 'LEVEL'
        ? { divisionId: (await Division.findAll({ where: { levelId: a.ids, academicYearId: ctx.academicYearId }, attributes: ['id'], raw: true })).map((d) => d.id) }
        : {};
  const rows = await Enrollment.findAll({
    where: {
      academicYearId: ctx.academicYearId,
      status: 'ACTIVE',
      ...divisionFilter,
      ...(a.type === 'STUDENTS' ? { studentId: a.ids } : {}),
    },
    include: [{ model: Student, where: { schoolId: ctx.schoolId, active: true }, attributes: [] }],
    attributes: ['studentId', 'divisionId'],
    raw: true,
  });
  return rows.map((r) => ({ studentId: r.studentId as number, divisionId: r.divisionId as number }));
};

/**
 * Resuelve destinatarios: familias (con el/los alumnos por los que reciben) y, si corresponde, personal.
 * Devuelve Map<userId, studentIds[]>.
 */
export const resolveRecipients = async (ctx: SchoolContext, a: Audience) => {
  const out = new Map<number, number[]>();
  const students = await audienceStudents(ctx, a);

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
        await Membership.findAll({ where: { schoolId: ctx.schoolId, active: true, role: { [Op.ne]: 'TUTOR' }, ...levelFilter }, attributes: ['userId'], raw: true })
      ).map((m) => m.userId as number);
    } else {
      const divisionIds = [...new Set(students.map((s) => s.divisionId))];
      const teachers = await TeachingAssignment.findAll({ where: { divisionId: divisionIds }, attributes: ['teacherId'], raw: true });
      staffIds = teachers.map((t) => t.teacherId as number);
    }
    staffIds.forEach((id) => !out.has(id) && out.set(id, []));
  }

  out.delete(ctx.userId);
  return out;
};

export const audienceLabel = async (ctx: SchoolContext, a: Audience) => {
  switch (a.type) {
    case 'SCHOOL':
      return 'Toda la institución';
    case 'STAFF':
      return 'Personal';
    case 'LEVEL':
      return (await Level.findAll({ where: { id: a.ids, schoolId: ctx.schoolId }, attributes: ['name'] })).map((l) => l.name).join(', ');
    case 'DIVISION':
      return (await Division.findAll({ where: { id: a.ids, schoolId: ctx.schoolId }, attributes: ['name'], order: [['name', 'ASC']] })).map((d) => d.name).join(', ');
    case 'STUDENTS': {
      const s = await Student.findAll({ where: { id: a.ids, schoolId: ctx.schoolId }, attributes: ['firstName', 'lastName'] });
      return s.length > 3 ? `${s.length} alumnos` : s.map((x) => `${x.firstName} ${x.lastName}`).join(', ');
    }
  }
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
export const contactsForGuardian = async (ctx: SchoolContext, studentId: number): Promise<Contact[]> => {
  const divisionId = await studentDivisionId(ctx, studentId);
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
    Membership.findAll({
      where: {
        schoolId: ctx.schoolId,
        active: true,
        role: { [Op.in]: [...LEADERSHIP_ROLES, 'PRECEPTOR', 'SECRETARIO'] },
        [Op.or]: [{ levelId: null }, { levelId: division!.levelId }],
      },
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'avatar'], where: { isActive: true } }],
    }),
  ]);

  const map = new Map<number, Contact>();
  for (const m of staff) {
    if (m.role === 'PRECEPTOR' && m.divisionIds?.length && !m.divisionIds.includes(divisionId)) continue;
    const u = (m as Membership & { User?: User }).User!;
    map.set(u.id, { userId: u.id, name: `${u.firstName} ${u.lastName}`, role: ROLE_LABELS[m.role as SchoolRole], detail: m.title, avatar: u.avatar });
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

/** Familias de un alumno (para que el personal inicie una conversación). */
export const guardiansOf = async (studentId: number): Promise<Contact[]> => {
  const links = await StudentGuardian.findAll({
    where: { studentId },
    include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'avatar'], where: { isActive: true } }],
  });
  return links.map((l) => {
    const u = (l as StudentGuardian & { User?: User }).User!;
    return { userId: u.id, name: `${u.firstName} ${u.lastName}`, role: 'Familia', detail: l.relationship, avatar: u.avatar };
  });
};
