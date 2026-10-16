import { Router } from 'express';
import { z } from 'zod';
import { Op, QueryTypes } from 'sequelize';
import {
  Division,
  Level,
  TeachingAssignment,
  Subject,
  User,
  Enrollment,
  Student,
  ClassroomPost,
  FileAsset,
  sequelize,
} from '../../models';
import { asyncHandler, validate, idParam, notFound, forbidden, badRequest } from '../../lib/http';
import { SchoolContext, canSeeDivision } from '../context';
import { canPostInDivision, guardianInDivision } from './files';
import { signFiles } from '../services/files';
import { notify } from '../../lib/notify';

const router = Router();

/** Personal con alcance sobre la división o familia de un alumno del aula. */
const classroomAccess = async (ctx: SchoolContext, divisionId: number) => {
  const division = await Division.findOne({ where: { id: divisionId, schoolId: ctx.schoolId }, include: [{ model: Level, attributes: ['id', 'name', 'type'] }] });
  if (!division) throw notFound('Aula inexistente.');
  if (ctx.isStaff && canSeeDivision(ctx, divisionId)) return { division, asGuardian: false, canPost: canPostInDivision(ctx, divisionId) };
  if (await guardianInDivision(ctx, divisionId)) return { division, asGuardian: true, canPost: false };
  throw forbidden('No tenés acceso a esta aula.');
};

/**
 * Mis aulas. Docente: las divisiones donde dicta. Conducción/preceptoría: su alcance.
 * Familia: las aulas de sus hijos.
 */
router.get(
  '/classrooms',
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    if (!ctx.academicYearId) return res.json([]);
    let ids: number[] | 'ALL' = [];
    if (ctx.isStaff) ids = ctx.scope.all ? 'ALL' : ctx.scope.divisionIds;
    const childDivisions = ctx.childIds.length
      ? (await Enrollment.findAll({ where: { studentId: ctx.childIds, academicYearId: ctx.academicYearId, status: 'ACTIVE' }, attributes: ['divisionId', 'studentId'], raw: true }))
      : [];
    if (ids !== 'ALL') ids = [...new Set([...ids, ...childDivisions.map((e) => e.divisionId as number)])];
    if (ids !== 'ALL' && !ids.length) return res.json([]);

    const divisions = await Division.findAll({
      where: { schoolId: ctx.schoolId, academicYearId: ctx.academicYearId, ...(ids === 'ALL' ? {} : { id: ids }) },
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

    const children = ctx.childIds.length
      ? await Student.findAll({ where: { id: ctx.childIds }, attributes: ['id', 'firstName'] })
      : [];
    const subjectNames = ctx.teaching.length
      ? new Map((await Subject.findAll({ where: { id: ctx.teaching.map((t) => t.subjectId) }, attributes: ['id', 'name'] })).map((s) => [s.id, s.name]))
      : new Map<number, string>();

    res.json(
      divisions.map((d) => ({
        ...d.toJSON(),
        mySubjects: ctx.teaching.filter((t) => t.divisionId === d.id).map((t) => subjectNames.get(t.subjectId)),
        myChildren: childDivisions.filter((e) => e.divisionId === d.id).map((e) => children.find((c) => c.id === e.studentId)?.firstName),
      }))
    );
  })
);

/** Detalle del aula: docentes por materia y alumnos (la familia ve solo docentes y la cantidad de alumnos). */
router.get(
  '/classrooms/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { division, asGuardian, canPost } = await classroomAccess(ctx, Number(req.params.id));
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
        mine: a.teacherId === ctx.userId,
      })),
      studentCount: enrollments.length,
      students: asGuardian
        ? enrollments.filter((e) => ctx.childIds.includes(e.Student!.id)).map((e) => e.Student)
        : enrollments.map((e) => e.Student),
      canPost,
      canAnnounce: ctx.permissions.has('announcements.publish') && !asGuardian,
      asGuardian,
    });
  })
);

/** Muro del aula: materiales y tareas (paginado hacia atrás). */
router.get(
  '/classrooms/:id/posts',
  validate({
    params: idParam,
    query: z.object({ subjectId: z.coerce.number().int().optional(), kind: z.enum(['MATERIAL', 'TAREA']).optional(), before: z.coerce.number().int().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { division } = await classroomAccess(ctx, Number(req.params.id));
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
      data: posts.map((p) => ({ ...p.toJSON(), files: p.fileIds.map((id) => files.get(id)).filter(Boolean), canEdit: p.authorId === ctx.userId || ctx.permissions.has('grades.write.any') })),
      hasMore: posts.length === 20,
    });
  })
);

const postBody = z.object({
  kind: z.enum(['MATERIAL', 'TAREA']).default('MATERIAL'),
  subjectId: z.number().int().nullish(),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().max(20000).default(''),
  links: z.array(z.object({ url: z.string().url().max(1000), title: z.string().max(160).optional() })).max(10).default([]),
  fileIds: z.array(z.number().int()).max(15).default([]),
  dueDate: z.string().date().nullish(),
  pinned: z.boolean().default(false),
  notifyFamilies: z.boolean().default(true),
});

const assertFiles = async (ctx: SchoolContext, ids: number[]) => {
  if (!ids.length) return;
  const own = await FileAsset.count({ where: { id: ids, schoolId: ctx.schoolId, uploaderId: ctx.userId, status: 'READY' } });
  if (own !== new Set(ids).size) throw badRequest('Algún archivo no es tuyo o todavía no terminó de subirse.');
};

router.post(
  '/classrooms/:id/posts',
  validate({ params: idParam, body: postBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const input = req.body as z.infer<typeof postBody>;
    const { division } = await classroomAccess(ctx, Number(req.params.id));
    if (!canPostInDivision(ctx, division.id, input.subjectId)) throw forbidden('Solo los docentes del aula (o conducción) pueden publicar.');
    if (input.subjectId && !(await TeachingAssignment.count({ where: { divisionId: division.id, subjectId: input.subjectId } }))) {
      throw badRequest('Esa materia no se dicta en esta aula.');
    }
    await assertFiles(ctx, input.fileIds);

    const post = await ClassroomPost.create({
      schoolId: ctx.schoolId,
      divisionId: division.id,
      subjectId: input.subjectId ?? null,
      authorId: ctx.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      links: input.links,
      fileIds: input.fileIds,
      dueDate: input.kind === 'TAREA' ? input.dueDate ?? null : null,
      pinned: input.pinned,
    });
    // Los archivos quedan asociados al aula (para permisos de descarga y el panel de uso).
    if (input.fileIds.length) await FileAsset.update({ divisionId: division.id, subjectId: input.subjectId ?? null, purpose: 'MATERIAL' }, { where: { id: input.fileIds } });

    if (input.notifyFamilies) {
      const guardians = (await sequelize.query(
        `SELECT DISTINCT g."userId" FROM "StudentGuardian" g
           JOIN "Enrollment" e ON e."studentId" = g."studentId" AND e."divisionId" = :divisionId AND e.status = 'ACTIVE'
          WHERE g."receivesCommunications" = true`,
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
  })
);

const loadEditablePost = async (ctx: SchoolContext, id: number) => {
  const post = await ClassroomPost.findOne({ where: { id, schoolId: ctx.schoolId } });
  if (!post) throw notFound();
  if (post.authorId !== ctx.userId && !(ctx.permissions.has('grades.write.any') && canSeeDivision(ctx, post.divisionId as number))) throw forbidden();
  return post;
};

router.patch(
  '/classroom-posts/:id',
  validate({ params: idParam, body: postBody.omit({ notifyFamilies: true }).partial() }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const post = await loadEditablePost(ctx, Number(req.params.id));
    if (req.body.fileIds) await assertFiles(ctx, req.body.fileIds.filter((id: number) => !post.fileIds.includes(id)));
    res.json(await post.update(req.body));
  })
);

router.delete(
  '/classroom-posts/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const post = await loadEditablePost(req.school!, Number(req.params.id));
    // Los archivos NO se borran del bucket acá: el docente los gestiona desde "Mis archivos".
    await post.destroy();
    res.status(204).end();
  })
);

/** Comunicados que llegaron a esta aula (a la división, a su nivel o a toda la escuela). */
router.get(
  '/classrooms/:id/announcements',
  validate({ params: idParam, query: z.object({ page: z.coerce.number().int().min(1).default(1) }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { division } = await classroomAccess(ctx, Number(req.params.id));
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
        replacements: { uid: ctx.userId, sid: ctx.schoolId, level: `[${division.levelId}]`, division: `[${division.id}]`, offset: (page - 1) * 20 },
        type: QueryTypes.SELECT,
      }
    );
    res.json({ data: rows, hasMore: rows.length === 20 });
  })
);

export default router;
