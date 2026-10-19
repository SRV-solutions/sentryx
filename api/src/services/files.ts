import { Op, QueryTypes } from 'sequelize';
import { FileAsset, School, ClassroomPost, sequelize } from '../models';
import type { FilePurpose } from '../models/school/classroom';
import { env } from '../config/env';
import { presignUpload, presignDownload, headObject, deleteObject } from '../config/s3';
import { badRequest, HttpError } from '../lib/http';

const MB = 1024 * 1024;

/** Tipos permitidos: documentos de clase, imágenes, audio y video. Nada ejecutable. */
const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-[\w.]+|vnd\.oasis\.opendocument\.[\w.]+)|text\/(plain|csv)|audio\/(mpeg|mp4|ogg|webm|x-m4a)|video\/(mp4|webm|quicktime))$/;

export const maxBytesFor = (mime: string) => (mime.startsWith('video/') ? env.VIDEO_MAX_MB : env.FILE_MAX_MB) * MB;

/**
 * Tope opcional para TODO el colegio (lo fija el equipo de Sentryx por colegio). Sin tope, manda el
 * espacio de cada persona según su plan (userUsedBytes / planDefinition().storageGb).
 */
export const quotaBytes = async (schoolId: number) => {
  const school = await School.findByPk(schoolId, { attributes: ['storageQuotaMb'] });
  return school?.storageQuotaMb ? school.storageQuotaMb * MB : null;
};

/** Lo que subió una persona en el colegio. Los recibos de sueldo no cuentan (los sube administración para otros). */
export const userUsedBytes = async (schoolId: number, userId: number) => {
  const [row] = (await sequelize.query(
    `SELECT COALESCE(SUM(size), 0)::bigint AS used FROM "FileAsset" WHERE "schoolId" = :schoolId AND "uploaderId" = :userId AND purpose <> 'PAYROLL'`,
    { replacements: { schoolId, userId }, type: QueryTypes.SELECT }
  )) as Array<{ used: string }>;
  return Number(row.used);
};

export const GB = 1024 * MB;

export const usedBytes = async (schoolId: number) => {
  const [row] = (await sequelize.query(`SELECT COALESCE(SUM(size), 0)::bigint AS used FROM "FileAsset" WHERE "schoolId" = :schoolId`, {
    replacements: { schoolId },
    type: QueryTypes.SELECT,
  })) as Array<{ used: string }>;
  return Number(row.used);
};

/** ¿Hay bucket y credenciales? (sin esto no se pueden adjuntar archivos). */
export const isStorageConfigured = () => !!env.filesBucket && !!env.storage.accessKeyId && !!env.storage.secretAccessKey;

const bucket = () => {
  if (!isStorageConfigured()) throw new HttpError(503, 'Todavía no está habilitada la carga de archivos en este servidor. Avisale al equipo de Sentryx.');
  return env.filesBucket as string;
};

/**
 * Reserva el archivo y devuelve una URL firmada para que el navegador lo suba directo al bucket.
 * El servidor no recibe el archivo: no consume memoria ni ancho de banda del backend.
 */
export const createUpload = async (opts: {
  schoolId: number;
  uploaderId: number;
  fileName: string;
  contentType: string;
  size: number;
  purpose: FilePurpose;
  divisionId?: number | null;
  subjectId?: number | null;
  /** Espacio de la persona según su plan. */
  userLimitBytes: number;
}) => {
  if (!ALLOWED.test(opts.contentType)) throw badRequest('Tipo de archivo no permitido. Usá PDF, documentos de Office, imágenes, audio o video.');
  // Recibos de sueldo: solo PDF y livianos (no cuentan en el espacio de nadie, así que se acotan acá).
  if (opts.purpose === 'PAYROLL' && (opts.contentType !== 'application/pdf' || opts.size > 10 * MB)) throw badRequest('Los recibos tienen que ser PDF de hasta 10 MB.');
  const max = maxBytesFor(opts.contentType);
  if (opts.size > max) throw badRequest(`El archivo supera el máximo de ${Math.round(max / MB)} MB.`);
  const [quota, used, userUsed] = await Promise.all([quotaBytes(opts.schoolId), usedBytes(opts.schoolId), userUsedBytes(opts.schoolId, opts.uploaderId)]);
  if (opts.purpose !== 'PAYROLL' && userUsed + opts.size > opts.userLimitBytes) {
    throw new HttpError(
      507,
      `Llegaste a tu espacio de ${Math.round(opts.userLimitBytes / GB)} GB. Borrá archivos que ya no uses en "Archivos" o pedí un plan con más espacio.`,
      { code: 'USER_STORAGE_FULL', used: userUsed, limit: opts.userLimitBytes }
    );
  }
  if (quota !== null && used + opts.size > quota) throw new HttpError(507, 'La institución alcanzó su espacio de almacenamiento. Pedile a administración que libere archivos.');

  const { key, url } = await presignUpload({
    bucket: bucket(),
    prefix: `schools/${opts.schoolId}/${opts.purpose.toLowerCase()}/${opts.uploaderId}`,
    fileName: opts.fileName,
    contentType: opts.contentType,
    size: opts.size,
  });
  const asset = await FileAsset.create({
    schoolId: opts.schoolId,
    uploaderId: opts.uploaderId,
    divisionId: opts.divisionId ?? null,
    subjectId: opts.subjectId ?? null,
    purpose: opts.purpose,
    key,
    name: opts.fileName.slice(0, 200),
    mimeType: opts.contentType,
    // Se reserva lo declarado para que dos subidas simultáneas no superen la cuota.
    size: opts.size,
  });
  return { fileId: asset.id, uploadUrl: url };
};

/** Confirma la subida leyendo el tamaño REAL desde el bucket (no se confía en lo que dice el navegador). */
export const confirmUpload = async (asset: FileAsset) => {
  if (asset.status === 'READY') return asset;
  let size: number;
  try {
    size = Number((await headObject(bucket(), asset.key)).ContentLength ?? 0);
  } catch {
    throw badRequest('No encontramos el archivo en el almacenamiento. Volvé a subirlo.');
  }
  // Nunca más de lo declarado al pedir la subida (es lo que se descontó del espacio).
  if (size > maxBytesFor(asset.mimeType) || size > asset.size) {
    await deleteObject(bucket(), asset.key).catch(() => {});
    await asset.destroy();
    throw badRequest('El archivo supera el tamaño permitido.');
  }
  return asset.update({ status: 'READY', size });
};

export interface SignedFile {
  id: number;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

/** URLs firmadas (1 h) para los archivos listos. Los borrados o pendientes simplemente no aparecen. */
export const signFiles = async (ids: number[]): Promise<Map<number, SignedFile>> => {
  const out = new Map<number, SignedFile>();
  if (!ids.length || !env.filesBucket) return out;
  const assets = await FileAsset.findAll({ where: { id: [...new Set(ids)], status: 'READY' } });
  await Promise.all(
    assets.map(async (a) =>
      out.set(a.id, { id: a.id, name: a.name, size: a.size, mimeType: a.mimeType, url: await presignDownload(bucket(), a.key, 3600, a) })
    )
  );
  return out;
};

/** Borra del bucket y de la base, y lo quita de las publicaciones que lo referencian. */
export const deleteFile = async (asset: FileAsset) => {
  await deleteObject(bucket(), asset.key).catch((err) => console.error('[files] delete', err.message));
  await sequelize.transaction(async (transaction) => {
    await ClassroomPost.update(
      { fileIds: sequelize.fn('array_remove', sequelize.col('fileIds'), asset.id) as unknown as number[] },
      { where: { fileIds: { [Op.contains]: [asset.id] } }, transaction }
    );
    await asset.destroy({ transaction });
  });
};

/** Limpieza: subidas iniciadas y nunca confirmadas (más de 6 h). */
export const cleanupPendingUploads = async () => {
  if (!env.filesBucket) return;
  const stale = await FileAsset.findAll({ where: { status: 'PENDING', createdAt: { [Op.lt]: new Date(Date.now() - 6 * 3600_000) } }, limit: 200 });
  for (const a of stale) {
    await deleteObject(bucket(), a.key).catch(() => {});
    await a.destroy();
  }
  if (stale.length) console.log(`[files] ${stale.length} subidas sin confirmar eliminadas`);
  // Recibos subidos pero nunca asignados a una persona (carga cortada o sin DNI reconocible): 1 día de margen.
  const orphanReceipts = (await sequelize.query(
    `SELECT f.id FROM "FileAsset" f WHERE f.purpose = 'PAYROLL' AND f."createdAt" < :limit
        AND NOT EXISTS (SELECT 1 FROM "PayrollReceipt" r WHERE r."fileId" = f.id) LIMIT 200`,
    { replacements: { limit: new Date(Date.now() - 24 * 3600_000) }, type: QueryTypes.SELECT }
  )) as Array<{ id: number }>;
  for (const { id } of orphanReceipts) {
    const asset = await FileAsset.findByPk(id);
    if (asset) await deleteFile(asset);
  }
  if (orphanReceipts.length) console.log(`[files] ${orphanReceipts.length} recibos sin asignar eliminados`);
};
