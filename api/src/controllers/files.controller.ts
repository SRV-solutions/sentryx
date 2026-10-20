/** Controlador de files: la lógica de cada ruta de routes/files.routes.ts. */
import { z } from 'zod';
import { Op, QueryTypes } from 'sequelize';
import { FileAsset, User, Division, Subject, sequelize } from '../models';
import { asyncHandler, notFound, forbidden, pagination } from '../lib/http';
import { SchoolSession, canSeeDivision } from '../services/schoolSession';
import { createUpload, confirmUpload, signFiles, deleteFile, quotaBytes, usedBytes, userUsedBytes, GB } from '../services/files';
import { PayrollReceipt } from '../models';
import { DEFAULT_PLAN, planDefinition } from '../constants/plans';
import { currentPlans } from '../services/plans';
import { audit } from '../services/audit';
import { Entity, Action } from '../constants/permissions';
import { listQuery } from '../validators/files.validator';
import { RoleCode, PRECEPTOR_ROLES } from '../constants/roles';

/** ¿Puede publicar material en esa división? Docente que la dicta o personal con alcance y permiso de publicar. */
export const canPostInDivision = (session: SchoolSession, divisionId: number, subjectId?: number | null) => {
  if (session.teaching.some((t) => t.divisionId === divisionId && (!subjectId || t.subjectId === subjectId))) return true;
  const leadsOrPrecepts = session.can(Entity.GRADES, Action.UPDATE_ANY) || session.roles.some((r) => PRECEPTOR_ROLES.includes(r));
  return leadsOrPrecepts && canSeeDivision(session, divisionId);
};

/** ¿El usuario tiene un hijo inscripto en esa división (ciclo vigente)? */
export const guardianInDivision = async (session: SchoolSession, divisionId: number) => {
  // El estudiante con cuenta accede a su propia aula como lo haría su familia (solo lectura).
  if (session.self?.divisionId === divisionId) return true;
  if (!session.childIds.length || !session.academicYearId) return false;
  const [row] = (await sequelize.query(
    `SELECT 1 FROM "Enrollment" WHERE "divisionId" = :divisionId AND status = 'ACTIVE' AND "studentId" IN (:ids) LIMIT 1`,
    { replacements: { divisionId, ids: session.childIds }, type: QueryTypes.SELECT }
  )) as unknown[];
  return !!row;
};

// POST /files/presign
export const createUploadUrl = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const b = req.body;
    if (b.purpose === 'MATERIAL') {
      if (!b.divisionId || !canPostInDivision(session, b.divisionId, b.subjectId)) {
        throw forbidden('No podés subir material a esa aula.');
      }
    } else if (b.purpose === 'OTHER' && b.contentType.startsWith('image/') && !session.isStaff) {
      throw forbidden();
    } else if (b.purpose === 'ANNOUNCEMENT' && !session.can(Entity.ANNOUNCEMENTS, Action.CREATE)) {
      throw forbidden();
    } else if (b.purpose === 'PAYROLL' && !session.can(Entity.PAYROLL, Action.CREATE)) {
      throw forbidden('No podés subir recibos de sueldo.');
    } else if ((b.purpose === 'EVENT' || b.purpose === 'PROGRAM') && !session.isStaff) {
      throw forbidden();
    }
    const userLimitBytes = planDefinition(session.plan).storageGb * GB;
    res.json(await createUpload({ ...b, schoolId: session.schoolId, uploaderId: session.userId, userLimitBytes }));
  });

// POST /files/:id/confirm
export const confirmUploadedFile = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const asset = await FileAsset.findOne({ where: { id: req.params.id, schoolId: session.schoolId, uploaderId: session.userId } });
    if (!asset) throw notFound();
    const ready = await confirmUpload(asset);
    res.json({ id: ready.id, name: ready.name, size: ready.size, mimeType: ready.mimeType });
  });

// GET /files
export const listFiles = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { page, limit, scope, divisionId, uploaderId, q } = req.query as unknown as z.infer<typeof listQuery>;
    const admin = session.can(Entity.USERS, Action.UPDATE) || session.can(Entity.SCHOOL, Action.UPDATE);
    if (scope === 'school' && !admin) throw forbidden();
    // Los recibos de sueldo no se listan acá: se ven solo en "Recibos" (la persona y administración).
    const where: Record<string | symbol, unknown> = { schoolId: session.schoolId, status: 'READY', purpose: { [Op.ne]: 'PAYROLL' } };
    if (scope === 'mine') where.uploaderId = session.userId;
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
  });

/** Mi espacio: lo que subí y el límite de mi plan. */
// GET /files/my-usage
export const getMyStorageUsage = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const plan = planDefinition(session.plan);
    res.json({ used: await userUsedBytes(session.schoolId, session.userId), limit: plan.storageGb * GB, plan: { code: plan.code, name: plan.name } });
  });

/** Uso del almacenamiento: total, tope del colegio (si lo hay) y ranking por persona con el límite de su plan. */
// GET /files/usage
export const getStorageUsage = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const [quota, used, byUserRows, byType] = await Promise.all([
      quotaBytes(session.schoolId),
      usedBytes(session.schoolId),
      sequelize.query(
        `SELECT f."uploaderId", u."firstName", u."lastName", COUNT(*)::int AS files, SUM(f.size)::bigint AS bytes
           FROM "FileAsset" f JOIN "User" u ON u.id = f."uploaderId"
          WHERE f."schoolId" = :sid AND f.purpose <> 'PAYROLL' GROUP BY f."uploaderId", u."firstName", u."lastName" ORDER BY bytes DESC LIMIT 50`,
        { replacements: { sid: session.schoolId }, type: QueryTypes.SELECT }
      ) as Promise<Array<{ uploaderId: number; firstName: string; lastName: string; files: number; bytes: string }>>,
      sequelize.query(
        `SELECT CASE WHEN "mimeType" LIKE 'video/%' THEN 'Videos' WHEN "mimeType" LIKE 'image/%' THEN 'Imágenes'
                     WHEN "mimeType" LIKE 'audio/%' THEN 'Audio' ELSE 'Documentos' END AS kind,
                COUNT(*)::int AS files, SUM(size)::bigint AS bytes
           FROM "FileAsset" WHERE "schoolId" = :sid GROUP BY 1 ORDER BY bytes DESC`,
        { replacements: { sid: session.schoolId }, type: QueryTypes.SELECT }
      ),
    ]);
    const plans = await currentPlans(session.schoolId, byUserRows.map((r) => r.uploaderId));
    const byUser = byUserRows.map((row) => {
      const plan = planDefinition(plans.get(row.uploaderId) ?? DEFAULT_PLAN);
      return { ...row, plan: plan.name, limit: plan.storageGb * GB };
    });
    res.json({ quota, used, byUser, byType });
  });

/** Descarga: dueño, administración, personal con alcance sobre el aula o familia de un alumno del aula. */
// GET /files/:id
export const getDownloadUrl = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const asset = await FileAsset.findOne({ where: { id: req.params.id, schoolId: session.schoolId, status: 'READY' } });
    if (!asset) throw notFound();
    // Recibo de sueldo: solo la persona a la que pertenece y quien administra sueldos.
    if (asset.purpose === 'PAYROLL') {
      const owns = await PayrollReceipt.count({ where: { schoolId: session.schoolId, fileId: asset.id, userId: session.userId } });
      if (!owns && !session.can(Entity.PAYROLL, Action.READ)) throw forbidden();
      return res.json((await signFiles([asset.id])).get(asset.id));
    }
    const allowed =
      asset.uploaderId === session.userId ||
      session.can(Entity.USERS, Action.UPDATE) ||
      (asset.divisionId && asset.purpose === 'MATERIAL' && (canSeeDivision(session, asset.divisionId as number) || (await guardianInDivision(session, asset.divisionId as number))));
    if (!allowed) throw forbidden();
    res.json((await signFiles([asset.id])).get(asset.id));
  });

// DELETE /files/:id
export const deleteFileById = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const asset = await FileAsset.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!asset) throw notFound();
    if (asset.purpose === 'PAYROLL') {
      // Un recibo se anula desde "Recibos" (queda registro); acá solo se borra uno que nunca se asignó.
      if (!session.can(Entity.PAYROLL, Action.DELETE)) throw forbidden();
      if (await PayrollReceipt.count({ where: { fileId: asset.id } })) throw forbidden('Ese archivo es un recibo de sueldo: anulalo desde Recibos.');
    } else if (asset.uploaderId !== session.userId && !session.can(Entity.USERS, Action.UPDATE)) throw forbidden();
    await deleteFile(asset);
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'FileAsset', entityId: asset.id, action: 'delete', before: { name: asset.name, size: asset.size, uploaderId: asset.uploaderId } });
    res.status(204).end();
  });
