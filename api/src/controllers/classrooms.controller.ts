/** Controlador de classrooms: la lógica de cada ruta de routes/classrooms.routes.ts. */
import { z } from 'zod';
import { Op, QueryTypes } from 'sequelize';
import { Division, Level, TeachingAssignment, Subject, User, Enrollment, Student, ClassroomPost, FileAsset, sequelize } from '../models';
import { asyncHandler, notFound, forbidden, badRequest } from '../lib/http';
import { SchoolSession, canSeeDivision } from '../services/schoolSession';
import { canPostInDivision, guardianInDivision } from './files.controller';
import { signFiles } from '../services/files';
import { notify } from '../services/notifications';
import { Entity, Action } from '../constants/permissions';
import { postBody } from '../validators/classrooms.validator';

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
        ? enrollments.filter((e) => session.childIds.includes(e.Student!.id)).map((e) => e.Student)
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
      dueDate: input.kind === 'TAREA' ? input.dueDate ?? null : null,
      pinned: input.pinned,
    });

    if (input.fileIds.length) await FileAsset.update({ divisionId: division.id, subjectId: input.subjectId ?? null, purpose: 'MATERIAL' }, { where: { id: input.fileIds } });

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
        title: `${input.kind === 'TAREA' ? 'Nueva tarea' : 'Nuevo material'} · ${division.name}${subject ? ` · ${subject}` : ''}`,
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

/** Comunicados que llegaron a esta aula (a la división, a su nivel o a toda la escuela). */
// GET /classrooms/:id/announcements
export const listClassroomAnnouncements = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { division } = await classroomAccess(session, Number(req.params.id));
    const page = (req.query as unknown as { page: number }).page;
    const rows = await sequelize.query(
      `SELECT a.id, a.title, LEFT(a.body, 200) AS preview, a.priority, a."requiresAck", a."audienceLabel", a."createdAt",
              json_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName", 'avatar', u.avatar) AS author,
              r."readAt", r."ackAt", (r.id IS NOT NULL) AS "isRecipient"
         FROM "Announcement" a
         JOIN "User" u ON u.id = a."authorId"
         LEFT JOIN "AnnouncementRecipient" r ON r."announcementId" = a.id AND r."userId" = :uid
        WHERE a."schoolId" = :sid
          AND ( a.audience->>'type' = 'SCHOOL'
             OR (a.audience->>'type' = 'LEVEL' AND a.audience->'ids' @> CAST(:level AS jsonb))
             OR (a.audience->>'type' = 'DIVISION' AND a.audience->'ids' @> CAST(:division AS jsonb)) )
        ORDER BY a."createdAt" DESC
        LIMIT 20 OFFSET :offset`,
      {
        replacements: { uid: session.userId, sid: session.schoolId, level: `[${division.levelId}]`, division: `[${division.id}]`, offset: (page - 1) * 20 },
        type: QueryTypes.SELECT,
      }
    );
    res.json({ data: rows, hasMore: rows.length === 20 });
  });
