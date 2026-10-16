import { Op, QueryTypes } from 'sequelize';
import { FileAsset, School, ClassroomPost, sequelize } from '../../models';
import type { FilePurpose } from '../../models/school/classroom';
import { env } from '../../config/env';
import { presignUpload, presignDownload, headObject, deleteObject } from '../../config/s3';
import { badRequest, HttpError } from '../../lib/http';

const MB = 1024 * 1024;

/** Tipos permitidos: documentos de clase, imágenes, audio y video. Nada ejecutable. */
const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-[\w.]+|vnd\.oasis\.opendocument\.[\w.]+)|text\/(plain|csv)|audio\/(mpeg|mp4|ogg|webm|x-m4a)|video\/(mp4|webm|quicktime))$/;

export const maxBytesFor = (mime: string) => (mime.startsWith('video/') ? env.VIDEO_MAX_MB : env.FILE_MAX_MB) * MB;

export const quotaBytes = async (schoolId: number) => {
  const school = await School.findByPk(schoolId, { attributes: ['storageQuotaMb'] });
  return (school?.storageQuotaMb ?? env.STORAGE_QUOTA_MB) * MB;
};

export const usedBytes = async (schoolId: number) => {
  const [row] = (await sequelize.query(`SELECT COALESCE(SUM(size), 0)::bigint AS used FROM "FileAsset" WHERE "schoolId" = :schoolId`, {
    replacements: { schoolId },
    type: QueryTypes.SELECT,
  })) as Array<{ used: string }>;
  return Number(row.used);
};

const bucket = () => {
  if (!env.filesBucket) throw new HttpError(503, 'El almacenamiento de archivos no está configurado.');
  return env.filesBucket;
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
}) => {
  if (!ALLOWED.test(opts.contentType)) throw badRequest('Tipo de archivo no permitido. Usá PDF, documentos de Office, imágenes, audio o video.');
  const max = maxBytesFor(opts.contentType);
  if (opts.size > max) throw badRequest(`El archivo supera el máximo de ${Math.round(max / MB)} MB.`);
  const [quota, used] = await Promise.all([quotaBytes(opts.schoolId), usedBytes(opts.schoolId)]);
  if (used + opts.size > quota) throw new HttpError(507, 'La institución alcanzó su espacio de almacenamiento. Pedile a administración que libere archivos.');

  const { key, url } = await presignUpload({
    bucket: bucket(),
    prefix: `schools/${opts.schoolId}/${opts.purpose.toLowerCase()}/${opts.uploaderId}`,
    fileName: opts.fileName,
    contentType: opts.contentType,
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
  if (size > maxBytesFor(asset.mimeType)) {
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
      out.set(a.id, { id: a.id, name: a.name, size: a.size, mimeType: a.mimeType, url: await presignDownload(bucket(), a.key, 3600) })
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
};
