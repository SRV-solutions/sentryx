/** Controlador de classrooms: la lógica de cada ruta de routes/classrooms.routes.ts. */
import { z } from 'zod';
import { Op, QueryTypes, WhereOptions } from 'sequelize';
import { Division, Level, TeachingAssignment, Subject, User, Enrollment, Student, ClassroomPost, FileAsset, SchoolEvent, sequelize } from '../models';
import { asyncHandler, notFound, forbidden, badRequest } from '../lib/http';
import { SchoolSession, canSeeDivision } from '../services/schoolSession';
import { canPostInDivision, guardianInDivision } from './files.controller';
import { signFiles } from '../services/files';
import { notify } from '../services/notifications';
import { Entity, Action } from '../constants/permissions';
import { postBody } from '../validators/classrooms.validator';
import { DATED_KINDS, POST_KIND_LABELS } from '../models/school/classroom';
import { divisionWhere } from '../services/schoolSession';
import { PlanFeature } from '../constants/plans';
import { nationalHolidays } from '../services/holidays';

/** Personal con alcance sobre la división o familia de un alumno del aula. */
const classroomAccess = async (session: SchoolSession, divisionId: number) => {
  const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, include: [{ model: Level, attributes: ['id', 'name', 'type'] }] });
  if (!division) throw notFound('Aula inexistente.');
  if (session.isStaff && canSeeDivision(session, divisionId)) return { division, asGuardian: false, canPost: canPostInDivision(session, divisionId) };
  if (await guardianInDivision(session, divisionId)) return { division, asGuardian: true, canPost: false };
  throw forbidden('No tenés acceso a esta aula.');
};

const assertFiles = async (session: SchoolSession, ids: number[]) => {
  if (!ids.length) return;
  const own = await FileAsset.count({ where: { id: ids, schoolId: session.schoolId, uploaderId: session.userId, status: 'READY' } });
  if (own !== new Set(ids).size) throw badRequest('Algún archivo no es tuyo o todavía no terminó de subirse.');
};

const loadEditablePost = async (session: SchoolSession, id: number) => {
  const post = await ClassroomPost.findOne({ where: { id, schoolId: session.schoolId } });
  if (!post) throw notFound();
  if (post.authorId !== session.userId && !(session.can(Entity.GRADES, Action.UPDATE_ANY) && canSeeDivision(session, post.divisionId as number))) throw forbidden();
  return post;
};

/**
 * Mis aulas. Docente: las divisiones donde dicta. Conducción/preceptoría: su alcance.
 * Familia: las aulas de sus hijos.
 */
// GET /classrooms
export const listClassrooms = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    if (!session.academicYearId) return res.json([]);
    let ids: number[] | 'ALL' = [];
    if (session.isStaff) ids = session.scope.all ? 'ALL' : session.scope.divisionIds;
    const childDivisions = session.childIds.length
      ? (await Enrollment.findAll({ where: { studentId: session.childIds, academicYearId: session.academicYearId, status: 'ACTIVE' }, attributes: ['divisionId', 'studentId'], raw: true }))
      : [];
    if (ids !== 'ALL') ids = [...new Set([...ids, ...childDivisions.map((e) => e.divisionId as number), ...(session.self?.divisionId ? [session.self.divisionId] : [])])];
    if (ids !== 'ALL' && !ids.length) return res.json([]);

    const divisions = await Division.findAll({
      where: { schoolId: session.schoolId, academicYearId: session.academicYearId, ...(ids === 'ALL' ? {} : { id: ids }) },
      attributes: {
        include: [
          [sequelize.literal(`(SELECT COUNT(*) FROM "Enrollment" e WHERE e."divisionId" = "Division"."id" AND e.status = 'ACTIVE')`), 'studentCount'],
          [sequelize.literal(`(SELECT COUNT(DISTINCT "teacherId") FROM "TeachingAssignment" t WHERE t."divisionId" = "Division"."id")`), 'teacherCount'],
          [sequelize.literal(`(SELECT MAX(p."createdAt") FROM "ClassroomPost" p WHERE p."divisionId" = "Division"."id")`), 'lastPostAt'],
          [sequelize.literal(`(SELECT COUNT(*) FROM "ClassroomPost" p WHERE p."divisionId" = "Division"."id" AND p."createdAt" > NOW() - INTERVAL '7 days')`), 'recentPosts'],
        ],
      },
      include: [{ model: Level, attributes: ['id', 'name', 'type'] }],
      order: [['levelId', 'ASC'], ['gradeYear', 'ASC'], ['name', 'ASC']],
    });

    const children = session.childIds.length
      ? await Student.findAll({ where: { id: session.childIds }, attributes: ['id', 'firstName'] })
      : [];
    const subjectNames = session.teaching.length
      ? new Map((await Subject.findAll({ where: { id: session.teaching.map((t) => t.subjectId) }, attributes: ['id', 'name'] })).map((s) => [s.id, s.name]))
      : new Map<number, string>();

    res.json(
      divisions.map((d) => ({
        ...d.toJSON(),
        mySubjects: session.teaching.filter((t) => t.divisionId === d.id).map((t) => subjectNames.get(t.subjectId)),
        myChildren: childDivisions.filter((e) => e.divisionId === d.id).map((e) => children.find((c) => c.id === e.studentId)?.firstName),
      }))
    );
  });

/** Detalle del aula: docentes por materia y alumnos (la familia ve solo docentes y la cantidad de alumnos). */
// GET /classrooms/:id
export const getClassroom = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { division, asGuardian, canPost } = await classroomAccess(session, Number(req.params.id));
    const [assignments, enrollments] = await Promise.all([
      TeachingAssignment.findAll({
        where: { divisionId: division.id },
        include: [
          { model: Subject, attributes: ['id', 'name'] },
          { model: User, as: 'Teacher', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
        ],
        order: [[Subject, 'name', 'ASC']],
      }),
      Enrollment.findAll({
        where: { divisionId: division.id, status: 'ACTIVE' },
        include: [{ model: Student, attributes: ['id', 'firstName', 'lastName', 'photoUrl'], where: { active: true } }],
        order: [[Student, 'lastName', 'ASC']],
      }),
    ]);
    res.json({
      division: { id: division.id, name: division.name, shift: division.shift, level: division.Level },
      subjects: assignments.map((a) => ({
        subject: a.Subject,
        teacher: (a as TeachingAssignment & { Teacher?: User }).Teacher,
        mine: a.teacherId === session.userId,
      })),
      studentCount: enrollments.length,
      students: asGuardian
        ? enrollments.filter((e) => session.childIds.includes(e.Student!.id) || e.Student!.id === session.self?.studentId).map((e) => e.Student)
        : enrollments.map((e) => e.Student),
      canPost,
      canAnnounce: session.can(Entity.ANNOUNCEMENTS, Action.CREATE) && !asGuardian,
      asGuardian,
    });
  });

/** Muro del aula: materiales y tareas (paginado hacia atrás). */
// GET /classrooms/:id/posts
export const listPosts = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { division } = await classroomAccess(session, Number(req.params.id));
    const { subjectId, kind, before } = req.query as unknown as { subjectId?: number; kind?: string; before?: number };
    const posts = await ClassroomPost.findAll({
      where: {
        divisionId: division.id,
        ...(subjectId ? { subjectId } : {}),
        ...(kind ? { kind } : {}),
        ...(before ? { id: { [Op.lt]: before } } : {}),
      },
      include: [
        { model: Subject, attributes: ['id', 'name'] },
        { model: User, as: 'Author', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
      ],
      order: [['pinned', 'DESC'], ['id', 'DESC']],
      limit: 20,
    });
    const files = await signFiles(posts.flatMap((p) => p.fileIds));
    res.json({
      data: posts.map((p) => ({ ...p.toJSON(), files: p.fileIds.map((id) => files.get(id)).filter(Boolean), canEdit: p.authorId === session.userId || session.can(Entity.GRADES, Action.UPDATE_ANY) })),
      hasMore: posts.length === 20,
    });
  });

/**
 * Agenda: evaluaciones, TP y tareas con fecha en los próximos días. Personal: sus cursos (alcance);
 * familias: los cursos de sus hijos; estudiantes: su curso.
 */
// GET /classrooms/agenda?days=&divisionId=
export const getAgenda = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { days, divisionId } = req.query as unknown as { days: number; divisionId?: number };
    if (!session.academicYearId) return res.json([]);
    let divisionIds: number[];
    if (session.isStaff) {
      divisionIds = (await Division.findAll({ where: { ...divisionWhere(session), academicYearId: session.academicYearId }, attributes: ['id'], raw: true })).map((d) => d.id);
    } else {
      const studentIds = session.self ? [session.self.studentId, ...session.childIds] : session.childIds;
      divisionIds = (await Enrollment.findAll({ where: { studentId: studentIds, academicYearId: session.academicYearId, status: 'ACTIVE' }, attributes: ['divisionId'], raw: true })).map((e) => e.divisionId as number);
    }
    if (divisionId) divisionIds = divisionIds.filter((id) => id === divisionId);
    if (!divisionIds.length) return res.json([]);
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const posts = await ClassroomPost.findAll({
      where: { divisionId: divisionIds, kind: DATED_KINDS, dueDate: { [Op.gte]: from, [Op.lte]: to } },
      include: [
        { model: Division, attributes: ['id', 'name'] },
        { model: Subject, attributes: ['id', 'name'] },
      ],
      attributes: ['id', 'kind', 'title', 'dueDate', 'divisionId', 'subjectId'],
      order: [['dueDate', 'ASC'], ['kind', 'ASC']],
      limit: 200,
    });
    res.json(posts.map((p) => ({ id: p.id, kind: p.kind, kindLabel: POST_KIND_LABELS[p.kind], title: p.title, dueDate: p.dueDate, division: (p as ClassroomPost & { Division?: Division }).Division, subject: (p as ClassroomPost & { Subject?: Subject | null }).Subject ?? null })));
  });

const EVENT_KIND_LABELS: Record<string, string> = { ACTO: 'Acto', FERIADO: 'Feriado', NO_LABORABLE: 'No laborable', EVENTO: 'Evento', REUNION: 'Reunión', SALIDA: 'Salida', OTRO: 'Otro' };
const SOURCE_ORDER = { HOLIDAY: 0, EVENT: 1, POST: 2 } as const;
const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');

interface CalendarItem {
  id: string;
  source: keyof typeof SOURCE_ORDER;
  kind: string;
  kindLabel: string;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  subject: { id: number; name: string } | null;
  description: string | null;
  location: string | null;
  link: string | null;
  cancelled: boolean;
}

/**
 * Calendario del aula: evaluaciones/TP/tareas del curso, actos y eventos del colegio que alcanzan a la división
 * y feriados nacionales. No depende del plan Integral: los feriados se calculan acá (salvo que el colegio ya los
 * haya importado, para no duplicarlos) y los eventos se muestran igual; solo el link al detalle del calendario
 * requiere el plan.
 */
// GET /classrooms/:id/calendar?from&to
export const getCalendar = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { division, asGuardian } = await classroomAccess(session, Number(req.params.id));
  const { from, to } = req.query as unknown as { from: string; to: string };

  const years = Array.from({ length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 }, (_, i) => Number(from.slice(0, 4)) + i);
  const holidays = years.flatMap(nationalHolidays).filter((h) => h.kind !== 'EFEMERIDE' && h.date >= from && h.date <= to);
  // Arreglo vacío = "para todos" (todos los niveles / todos los cursos).
  const emptyOr = (column: 'levelIds' | 'divisionIds', id: number) => ({ [Op.or]: [sequelize.where(sequelize.fn('cardinality', sequelize.col(column)), 0), { [column]: { [Op.contains]: [id] } }] });

  const [posts, events, imported] = await Promise.all([
    ClassroomPost.findAll({
      where: { divisionId: division.id, kind: DATED_KINDS, dueDate: { [Op.gte]: from, [Op.lte]: to } },
      include: [{ model: Subject, attributes: ['id', 'name'] }],
      attributes: ['id', 'kind', 'title', 'body', 'dueDate', 'subjectId'],
      order: [['dueDate', 'ASC'], ['id', 'ASC']],
      limit: 500,
    }),
    SchoolEvent.findAll({
      where: {
        schoolId: session.schoolId,
        date: { [Op.lte]: to },
        // Las familias y estudiantes no ven los eventos internos del personal.
        ...(asGuardian ? { audience: 'COMMUNITY' } : {}),
        [Op.and]: [
          // Solapa con el rango aunque empiece antes (eventos de varios días).
          sequelize.where(sequelize.fn('COALESCE', sequelize.col('endDate'), sequelize.col('date')), { [Op.gte]: from }),
          emptyOr('levelIds', division.levelId as number),
          emptyOr('divisionIds', division.id),
        ],
      } as WhereOptions,
      attributes: ['id', 'title', 'kind', 'date', 'endDate', 'startTime', 'endTime', 'location', 'description', 'cancelled'],
      order: [['date', 'ASC'], ['startTime', 'ASC']],
      limit: 500,
    }),
    // Feriados que el colegio ya importó (aunque los haya acotado a otro nivel): esos mandan sobre el cálculo.
    holidays.length
      ? SchoolEvent.findAll({ where: { schoolId: session.schoolId, holidayKey: holidays.map((h) => h.key), kind: { [Op.ne]: 'ACTO' } }, attributes: ['holidayKey'], raw: true })
      : Promise.resolve([] as Array<Pick<SchoolEvent, 'holidayKey'>>),
  ]);

  const importedKeys = new Set(imported.map((e) => e.holidayKey));
  const withLink = session.hasFeature(PlanFeature.EVENTS);
  const items: CalendarItem[] = [
    ...holidays.filter((h) => !importedKeys.has(h.key)).map((h): CalendarItem => ({
      id: `holiday-${h.key}`, source: 'HOLIDAY', kind: h.kind, kindLabel: EVENT_KIND_LABELS[h.kind], title: h.name, date: h.date, endDate: null, startTime: null, endTime: null,
      subject: null, description: h.originalDate ? `Feriado trasladado (fecha original: ${ddmmyyyy(h.originalDate)}).` : null, location: null, link: null, cancelled: false,
    })),
    ...events.map((e): CalendarItem => ({
      id: `event-${e.id}`, source: 'EVENT', kind: e.kind, kindLabel: EVENT_KIND_LABELS[e.kind] ?? e.kind, title: e.title, date: e.date, endDate: e.endDate && e.endDate !== e.date ? e.endDate : null,
      startTime: e.startTime, endTime: e.endTime, subject: null, description: e.description || null, location: e.location, link: withLink ? `/calendario/${e.id}` : null, cancelled: e.cancelled,
    })),
    ...posts.map((p): CalendarItem => ({
      id: `post-${p.id}`, source: 'POST', kind: p.kind, kindLabel: POST_KIND_LABELS[p.kind], title: p.title, date: p.dueDate as string, endDate: null, startTime: null, endTime: null,
      subject: (p as ClassroomPost & { Subject?: Subject | null }).Subject ?? null, description: p.body ? p.body.slice(0, 2000) : null, location: null, link: null, cancelled: false,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || (a.startTime ?? '').localeCompare(b.startTime ?? ''));

  res.json({ from, to, items });
});

// POST /classrooms/:id/posts
export const createPost = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const input = req.body as z.infer<typeof postBody>;
    const { division } = await classroomAccess(session, Number(req.params.id));
    if (!canPostInDivision(session, division.id, input.subjectId)) throw forbidden('Solo los docentes del aula (o conducción) pueden publicar.');
    if (input.subjectId && !(await TeachingAssignment.count({ where: { divisionId: division.id, subjectId: input.subjectId } }))) {
      throw badRequest('Esa materia no se dicta en esta aula.');
    }
    await assertFiles(session, input.fileIds);

    const post = await ClassroomPost.create({
      schoolId: session.schoolId,
      divisionId: division.id,
      subjectId: input.subjectId ?? null,
      authorId: session.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      links: input.links,
      fileIds: input.fileIds,
      dueDate: DATED_KINDS.includes(input.kind) ? input.dueDate ?? null : null,
      pinned: input.pinned,
    });

    // Los archivos subidos para este aula (o desde "Mis archivos") quedan como material del curso; los que ya pertenecen
    // a un comunicado, mensaje u otro lugar se comparten sin cambiarles el origen.
    if (input.fileIds.length) await FileAsset.update({ divisionId: division.id, subjectId: input.subjectId ?? null, purpose: 'MATERIAL' }, { where: { id: input.fileIds, purpose: { [Op.in]: ['OTHER', 'MATERIAL'] } } });

    if (input.notifyFamilies) {
      const guardians = (await sequelize.query(
        `SELECT DISTINCT g."userId" FROM "StudentGuardian" g
           JOIN "Enrollment" e ON e."studentId" = g."studentId" AND e."divisionId" = :divisionId AND e.status = 'ACTIVE'
          WHERE g."receivesCommunications" = true AND g.active`,
        { replacements: { divisionId: division.id }, type: QueryTypes.SELECT }
      )) as Array<{ userId: number }>;
      const subject = input.subjectId ? (await Subject.findByPk(input.subjectId, { attributes: ['name'] }))?.name : null;
      notify({
        userIds: guardians.map((g) => g.userId),
        title: `${input.kind === 'MATERIAL' ? 'Nuevo material' : input.kind === 'TAREA' ? 'Nueva tarea' : `${POST_KIND_LABELS[input.kind]}${input.dueDate ? ` · ${new Date(`${input.dueDate}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}` : ''}`} · ${division.name}${subject ? ` · ${subject}` : ''}`,
        message: input.title,
        type: 'classroom',
        link: `/aulas/${division.id}`,
        email: 'never',
      });
    }
    res.status(201).json(post);
  });

// PATCH /classroom-posts/:id
export const updatePost = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const post = await loadEditablePost(session, Number(req.params.id));
    if (req.body.fileIds) await assertFiles(session, req.body.fileIds.filter((id: number) => !post.fileIds.includes(id)));
    res.json(await post.update(req.body));
  });

// DELETE /classroom-posts/:id
export const deletePost = asyncHandler(async (req, res) => {
    const post = await loadEditablePost(req.schoolSession!, Number(req.params.id));

    await post.destroy();
    res.status(204).end();
  });

/**
 * Comunicados que llegaron a esta aula (a la división, a su nivel o a toda la escuela). Solo los ya enviados:
 * borradores y programados no se filtran. Familias y estudiantes ven únicamente los que recibieron (un comunicado
 * dirigido solo a estudiantes no le aparece a la familia, ni viceversa); el personal ve todos los del curso.
 */
// GET /classrooms/:id/announcements
export const listClassroomAnnouncements = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { division, asGuardian } = await classroomAccess(session, Number(req.params.id));
    const page = (req.query as unknown as { page: number }).page;
    const rows = await sequelize.query(
      `SELECT a.id, a.title, LEFT(a.body, 200) AS preview, a.priority, a.category, a."requiresAck", a."allowReplies", a."audienceLabel",
              COALESCE(a."sentAt", a."createdAt") AS "createdAt",
              json_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName", 'avatar', u.avatar) AS author,
              r."readAt", r."ackAt", (r.id IS NOT NULL) AS "isRecipient"
         FROM "Announcement" a
         JOIN "User" u ON u.id = a."authorId"
         ${asGuardian ? 'JOIN' : 'LEFT JOIN'} "AnnouncementRecipient" r ON r."announcementId" = a.id AND r."userId" = :uid
        WHERE a."schoolId" = :sid AND a.status = 'SENT'
          AND ( a.audience->>'type' = 'SCHOOL'
             OR (a.audience->>'type' = 'LEVEL' AND a.audience->'ids' @> CAST(:level AS jsonb))
             OR (a.audience->>'type' = 'DIVISION' AND a.audience->'ids' @> CAST(:division AS jsonb)) )
        ORDER BY COALESCE(a."sentAt", a."createdAt") DESC, a.id DESC
        LIMIT 20 OFFSET :offset`,
      {
        replacements: { uid: session.userId, sid: session.schoolId, level: `[${division.levelId}]`, division: `[${division.id}]`, offset: (page - 1) * 20 },
        type: QueryTypes.SELECT,
      }
    );
    res.json({ data: rows, hasMore: rows.length === 20 });
  });
