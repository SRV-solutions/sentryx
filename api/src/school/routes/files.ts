import { Router } from 'express';
import { z } from 'zod';
import { Op, QueryTypes } from 'sequelize';
import { FileAsset, User, Division, Subject, sequelize } from '../../models';
import { FILE_PURPOSES } from '../../models/school/classroom';
import { asyncHandler, validate, idParam, notFound, forbidden, pagination } from '../../lib/http';
import { SchoolContext, canSeeDivision, requirePerm } from '../context';
import { createUpload, confirmUpload, signFiles, deleteFile, quotaBytes, usedBytes } from '../services/files';
import { audit } from '../services/audit';

const router = Router();

/** ¿Puede publicar material en esa división? Docente que la dicta o personal con alcance y permiso de publicar. */
export const canPostInDivision = (ctx: SchoolContext, divisionId: number, subjectId?: number | null) => {
  if (ctx.teaching.some((t) => t.divisionId === divisionId && (!subjectId || t.subjectId === subjectId))) return true;
  const leadsOrPrecepts = ctx.permissions.has('grades.write.any') || ctx.roles.includes('PRECEPTOR');
  return leadsOrPrecepts && canSeeDivision(ctx, divisionId);
};

router.post(
  '/files/presign',
  validate({
    body: z.object({
      fileName: z.string().trim().min(1).max(200),
      contentType: z.string().max(120),
      size: z.number().int().positive(),
      purpose: z.enum(FILE_PURPOSES).default('OTHER'),
      divisionId: z.number().int().nullish(),
      subjectId: z.number().int().nullish(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const b = req.body;
    if (b.purpose === 'MATERIAL') {
      if (!b.divisionId || !canPostInDivision(ctx, b.divisionId, b.subjectId)) {
        throw forbidden('No podés subir material a esa aula.');
      }
    } else if (b.purpose === 'OTHER' && b.contentType.startsWith('image/') && !ctx.isStaff) {
      throw forbidden();
    } else if (b.purpose === 'ANNOUNCEMENT' && !ctx.permissions.has('announcements.publish')) {
      throw forbidden();
    }
    res.json(await createUpload({ ...b, schoolId: ctx.schoolId, uploaderId: ctx.userId }));
  })
);

router.post(
  '/files/:id/confirm',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const asset = await FileAsset.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId, uploaderId: ctx.userId } });
    if (!asset) throw notFound();
    const ready = await confirmUpload(asset);
    res.json({ id: ready.id, name: ready.name, size: ready.size, mimeType: ready.mimeType });
  })
);

/** Mis archivos (docente) o todos (administración), con filtros. */
const listQuery = pagination.extend({
  scope: z.enum(['mine', 'school']).default('mine'),
  divisionId: z.coerce.number().int().optional(),
  uploaderId: z.coerce.number().int().optional(),
  q: z.string().trim().max(60).optional(),
});

router.get(
  '/files',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { page, limit, scope, divisionId, uploaderId, q } = req.query as unknown as z.infer<typeof listQuery>;
    const admin = ctx.permissions.has('people.manage') || ctx.permissions.has('school.manage');
    if (scope === 'school' && !admin) throw forbidden();
    const where: Record<string | symbol, unknown> = { schoolId: ctx.schoolId, status: 'READY' };
    if (scope === 'mine') where.uploaderId = ctx.userId;
    else if (uploaderId) where.uploaderId = uploaderId;
    if (divisionId) where.divisionId = divisionId;
    if (q) where.name = { [Op.iLike]: `%${q}%` };
    const { rows, count } = await FileAsset.findAndCountAll({
      where,
      include: [
        { model: User, as: 'Uploader', attributes: ['id', 'firstName', 'lastName'] },
        { model: Division, attributes: ['id', 'name'] },
        { model: Subject, attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    res.json({ data: rows, pagination: { totalItems: count, currentPage: page, totalPages: Math.ceil(count / limit) } });
  })
);

/** Uso del almacenamiento: total, cuota y ranking por docente (para liberar espacio). */
router.get(
  '/files/usage',
  requirePerm('people.manage'),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const [quota, used, byUser, byType] = await Promise.all([
      quotaBytes(ctx.schoolId),
      usedBytes(ctx.schoolId),
      sequelize.query(
        `SELECT f."uploaderId", u."firstName", u."lastName", COUNT(*)::int AS files, SUM(f.size)::bigint AS bytes
           FROM "FileAsset" f JOIN "User" u ON u.id = f."uploaderId"
          WHERE f."schoolId" = :sid GROUP BY f."uploaderId", u."firstName", u."lastName" ORDER BY bytes DESC LIMIT 50`,
        { replacements: { sid: ctx.schoolId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT CASE WHEN "mimeType" LIKE 'video/%' THEN 'Videos' WHEN "mimeType" LIKE 'image/%' THEN 'Imágenes'
                     WHEN "mimeType" LIKE 'audio/%' THEN 'Audio' ELSE 'Documentos' END AS kind,
                COUNT(*)::int AS files, SUM(size)::bigint AS bytes
           FROM "FileAsset" WHERE "schoolId" = :sid GROUP BY 1 ORDER BY bytes DESC`,
        { replacements: { sid: ctx.schoolId }, type: QueryTypes.SELECT }
      ),
    ]);
    res.json({ quota, used, byUser, byType });
  })
);

/** Descarga: dueño, administración, personal con alcance sobre el aula o familia de un alumno del aula. */
router.get(
  '/files/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const asset = await FileAsset.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId, status: 'READY' } });
    if (!asset) throw notFound();
    const allowed =
      asset.uploaderId === ctx.userId ||
      ctx.permissions.has('people.manage') ||
      (asset.divisionId && asset.purpose === 'MATERIAL' && (canSeeDivision(ctx, asset.divisionId as number) || (await guardianInDivision(ctx, asset.divisionId as number))));
    if (!allowed) throw forbidden();
    res.json((await signFiles([asset.id])).get(asset.id));
  })
);

router.delete(
  '/files/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const asset = await FileAsset.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!asset) throw notFound();
    if (asset.uploaderId !== ctx.userId && !ctx.permissions.has('people.manage')) throw forbidden();
    await deleteFile(asset);
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'FileAsset', entityId: asset.id, action: 'delete', before: { name: asset.name, size: asset.size, uploaderId: asset.uploaderId } });
    res.status(204).end();
  })
);

/** ¿El usuario tiene un hijo inscripto en esa división (ciclo vigente)? */
export const guardianInDivision = async (ctx: SchoolContext, divisionId: number) => {
  if (!ctx.childIds.length || !ctx.academicYearId) return false;
  const [row] = (await sequelize.query(
    `SELECT 1 FROM "Enrollment" WHERE "divisionId" = :divisionId AND status = 'ACTIVE' AND "studentId" IN (:ids) LIMIT 1`,
    { replacements: { divisionId, ids: ctx.childIds }, type: QueryTypes.SELECT }
  )) as unknown[];
  return !!row;
};

export default router;
