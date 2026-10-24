/**
 * Ausencias docentes y horario del curso.
 *  - El/la docente avisa su propia ausencia; preceptoría, conducción y administración la registran por otros.
 *  - Se calcula a qué cursos afecta (donde dicta) y se avisa a estudiantes y familias de esos cursos.
 *  - El aula muestra el horario del curso (módulos, materia y docente) con las ausencias marcadas.
 */
import { Op, QueryTypes } from 'sequelize';
import { TeacherAbsence, TeachingAssignment, Division, Subject, User, StaffPosition, Level, UserRole, sequelize } from '../models';
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/http';
import { canSeeDivision, type SchoolSession } from '../services/schoolSession';
import { Entity, Action } from '../constants/permissions';
import { isStaffRole, RoleCode } from '../constants/roles';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';
import { guardianInDivision } from './files.controller';

/** Quién registra ausencias de otros: preceptoría (asistencia), conducción y administración (legajos). */
const managesAbsences = (s: SchoolSession) => s.roles.includes(RoleCode.PRECEPTOR) || s.roles.includes(RoleCode.JEFE_PRECEPTORES) || s.can(Entity.STAFF_RECORDS, Action.UPDATE) || s.can(Entity.SCHOOL, Action.UPDATE) || s.superAdmin;

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fmt = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

/** Cursos del ciclo vigente donde dicta, con sus materias. */
const teacherDivisions = async (session: SchoolSession, teacherId: number) => {
  const rows = await TeachingAssignment.findAll({
    where: { schoolId: session.schoolId, teacherId },
    include: [
      { model: Division, attributes: ['id', 'name'], where: session.academicYearId ? { academicYearId: session.academicYearId } : {} },
      { model: Subject, attributes: ['id', 'name'] },
    ],
  });
  const map = new Map<number, { id: number; name: string; subjects: string[] }>();
  for (const r of rows) {
    const d = map.get(r.divisionId as number) ?? { id: r.Division!.id, name: r.Division!.name, subjects: [] };
    d.subjects.push(r.Subject!.name);
    map.set(d.id, d);
  }
  return [...map.values()];
};

/** Estudiantes con cuenta y familias (que reciben comunicaciones) de esos cursos. */
const audienceOf = async (session: SchoolSession, divisionIds: number[]) => {
  if (!divisionIds.length || !session.academicYearId) return [];
  const rows = (await sequelize.query(
    `SELECT DISTINCT u.id FROM "Enrollment" e
       JOIN "Student" s ON s.id = e."studentId" AND s.active
       LEFT JOIN "StudentGuardian" g ON g."studentId" = s.id AND g.active AND g."receivesCommunications"
       JOIN "User" u ON u.id = g."userId" OR u.id = s."userId"
     WHERE e."divisionId" IN (:divisionIds) AND e."academicYearId" = :yid AND e.status = 'ACTIVE' AND u."isActive"`,
    { replacements: { divisionIds, yid: session.academicYearId }, type: QueryTypes.SELECT }
  )) as Array<{ id: number }>;
  return rows.map((r) => r.id);
};

/** Cursos que puede ver quien mira (personal: su alcance; familia: los de sus hijos; estudiante: el suyo). */
const visibleDivisions = async (session: SchoolSession): Promise<number[] | 'ALL'> => {
  if (session.isStaff) return session.scope.all ? 'ALL' : session.scope.divisionIds;
  const ids = new Set<number>();
  if (session.self?.divisionId) ids.add(session.self.divisionId);
  if (session.childIds.length && session.academicYearId) {
    const rows = (await sequelize.query(`SELECT "divisionId" FROM "Enrollment" WHERE "studentId" IN (:ids) AND "academicYearId" = :yid AND status = 'ACTIVE'`, {
      replacements: { ids: session.childIds, yid: session.academicYearId },
      type: QueryTypes.SELECT,
    })) as Array<{ divisionId: number }>;
    rows.forEach((r) => ids.add(r.divisionId));
  }
  return [...ids];
};

const present = async (session: SchoolSession, rows: TeacherAbsence[]) => {
  const divisionIds = [...new Set(rows.flatMap((r) => r.divisionIds))];
  const [divisions, assignments] = await Promise.all([
    Division.findAll({ where: { id: divisionIds.length ? divisionIds : [0] }, attributes: ['id', 'name'] }),
    TeachingAssignment.findAll({ where: { divisionId: divisionIds.length ? divisionIds : [0], teacherId: [...new Set(rows.map((r) => r.teacherId))] }, include: [{ model: Subject, attributes: ['name'] }] }),
  ]);
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    endDate: r.endDate,
    fromTime: r.fromTime,
    toTime: r.toTime,
    note: r.note,
    substitute: r.substitute,
    teacher: r.Teacher ? { id: r.Teacher.id, name: `${r.Teacher.firstName} ${r.Teacher.lastName}` } : null,
    divisions: r.divisionIds.map((id) => ({
      id,
      name: divisions.find((d) => d.id === id)?.name ?? '',
      subjects: assignments.filter((a) => a.divisionId === id && a.teacherId === r.teacherId).map((a) => a.Subject!.name),
    })),
    canDelete: r.teacherId === session.userId || r.createdById === session.userId || managesAbsences(session),
  }));
};

// GET /teacher-absences?from&to&divisionId — las que le corresponden a quien mira
export const listAbsences = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { from, to, divisionId } = req.query as { from?: string; to?: string; divisionId?: string };
  const start = from ?? new Date().toISOString().slice(0, 10);
  const end = to ?? new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const visible = await visibleDivisions(session);
  const only = divisionId ? Number(divisionId) : null;
  if (only && visible !== 'ALL' && !visible.includes(only)) throw forbidden('No tenés acceso a ese curso.');
  const filterDivisions = only ? [only] : visible === 'ALL' ? null : visible;
  const rows = await TeacherAbsence.findAll({
    where: {
      schoolId: session.schoolId,
      date: { [Op.lte]: end },
      [Op.and]: [
        { [Op.or]: [{ endDate: { [Op.gte]: start } }, { endDate: null, date: { [Op.gte]: start } }] },
        // La propia ausencia siempre se ve; el resto, si toca alguno de mis cursos.
        filterDivisions ? { [Op.or]: [{ divisionIds: { [Op.overlap]: filterDivisions.length ? filterDivisions : [0] } }, ...(only ? [] : [{ teacherId: session.userId }])] } : {},
      ],
    },
    include: [{ model: User, as: 'Teacher', attributes: ['id', 'firstName', 'lastName'] }],
    order: [['date', 'ASC'], ['fromTime', 'ASC']],
  });
  res.json(await present(session, rows));
});

// POST /teacher-absences
export const createAbsence = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const body = req.body as { teacherId?: number; date: string; endDate?: string | null; fromTime?: string | null; toTime?: string | null; note?: string; substitute?: string | null; notify: boolean };
  const teacherId = body.teacherId ?? session.userId;
  const own = teacherId === session.userId;
  if (!own && !managesAbsences(session)) throw forbidden('Solo preceptoría, la conducción o la administración registran ausencias de otras personas.');
  if (!(await UserRole.findAll({ where: { userId: teacherId, schoolId: session.schoolId, active: true } })).some((r) => isStaffRole(r.role))) throw badRequest('Esa persona no es parte del personal.');
  if (body.endDate && body.endDate < body.date) throw badRequest('El último día no puede ser anterior al primero.');
  if ((body.fromTime && !body.toTime) || (!body.fromTime && body.toTime) || (body.fromTime && body.toTime && body.fromTime >= body.toTime)) throw badRequest('Revisá la franja horaria (desde y hasta).');
  let divisions = await teacherDivisions(session, teacherId);
  // Quien registra por otros lo hace en su alcance (ej: la preceptora de 2º 1ª).
  if (!own && !session.scope.all) divisions = divisions.filter((d) => canSeeDivision(session, d.id));
  if (!own && !divisions.length && !session.scope.all) throw forbidden('Esa persona no dicta en cursos a tu cargo.');
  const absence = await TeacherAbsence.create({
    schoolId: session.schoolId,
    teacherId,
    date: body.date,
    endDate: body.endDate && body.endDate !== body.date ? body.endDate : null,
    fromTime: body.fromTime || null,
    toTime: body.toTime || null,
    divisionIds: divisions.map((d) => d.id),
    note: body.note?.trim() ?? '',
    substitute: body.substitute?.trim() || null,
    createdById: session.userId,
  });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'TeacherAbsence', entityId: absence.id, action: 'create', after: absence.toJSON() });

  if (body.notify && divisions.length) {
    const teacher = await User.findByPk(teacherId, { attributes: ['firstName', 'lastName'] });
    const when = `${fmt(absence.date)}${absence.endDate ? ` al ${fmt(absence.endDate)}` : ''}${absence.fromTime ? ` de ${absence.fromTime} a ${absence.toTime}` : ''}`;
    const what = divisions.map((d) => `${d.subjects.join(', ')} · ${d.name}`).join(' / ');
    notify({
      userIds: (await audienceOf(session, divisions.map((d) => d.id))).filter((id) => id !== teacherId),
      title: `Falta ${teacher?.firstName} ${teacher?.lastName}: ${when}`,
      message: `${what}.${absence.substitute ? ` Reemplazo: ${absence.substitute}.` : ''}${absence.note ? ` ${absence.note}` : ''}`,
      type: 'teacher_absence',
      link: `/aulas/${divisions[0].id}?tab=horario`,
      email: 'never',
    });
  }
  if (!own) notify({ userIds: [teacherId], title: 'Se registró tu ausencia', message: `${fmt(absence.date)}${absence.endDate ? ` al ${fmt(absence.endDate)}` : ''}. Si no es correcta, avisale a quien la cargó.`, type: 'teacher_absence', link: '/mi-legajo', email: 'never' });
  const [full] = await present(session, [Object.assign(absence, { Teacher: await User.findByPk(teacherId, { attributes: ['id', 'firstName', 'lastName'] }) }) as TeacherAbsence]);
  res.status(201).json(full);
});

// DELETE /teacher-absences/:id
export const deleteAbsence = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const absence = await TeacherAbsence.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
  if (!absence) throw notFound();
  if (absence.teacherId !== session.userId && absence.createdById !== session.userId && !managesAbsences(session)) throw forbidden();
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'TeacherAbsence', entityId: absence.id, action: 'delete', before: absence.toJSON() });
  await absence.destroy();
  res.status(204).end();
});

/** Horario del curso (para el aula): cada franja con materia, docente y duración del módulo. */
// GET /classrooms/:id/timetable
export const classroomTimetable = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const divisionId = Number(req.params.id);
  const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, include: [{ model: Level, attributes: ['id', 'name', 'settings'] }] });
  if (!division) throw notFound('Aula inexistente.');
  if (!(session.isStaff && canSeeDivision(session, divisionId)) && !(await guardianInDivision(session, divisionId))) throw forbidden('No tenés acceso a esta aula.');
  const positions = await StaffPosition.findAll({
    where: { schoolId: session.schoolId, active: true, schedule: { [Op.contains]: [{ divisionId }] } as never },
    include: [{ model: User, attributes: ['id', 'firstName', 'lastName'] }],
  });
  const subjects = new Map((await Subject.findAll({ where: { levelId: division.levelId }, attributes: ['id', 'name'] })).map((s) => [s.id, s.name]));
  const slots = positions.flatMap((p) =>
    p.schedule
      .filter((s) => s.divisionId === divisionId)
      .map((s) => ({
        day: s.day,
        from: s.from,
        to: s.to,
        modules: s.modules ?? null,
        moduleMinutes: p.moduleMinutes,
        shift: p.shift,
        subject: (s.subjectId && subjects.get(s.subjectId)) || s.label?.split(' · ')[0] || p.title,
        teacher: { id: p.User!.id, name: `${p.User!.firstName} ${p.User!.lastName}` },
      }))
  );
  const settings = (division.Level as unknown as { settings?: { timetable?: unknown } })?.settings;
  res.json({ division: { id: division.id, name: division.name, shift: division.shift }, timetable: settings?.timetable ?? null, slots });
});

