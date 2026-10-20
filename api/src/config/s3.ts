import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { env } from './env';

/**
 * Cliente único de almacenamiento. Cloudflare R2 es compatible con la API de S3, por eso se usa el
 * SDK de AWS apuntando al endpoint de R2 (región "auto"). Reutilizar el cliente ahorra latencia y memoria.
 */
export const s3 = new S3Client({
  region: env.storage.endpoint ? 'auto' : env.AWS_REGION,
  endpoint: env.storage.endpoint,
  credentials:
    env.storage.accessKeyId && env.storage.secretAccessKey
      ? { accessKeyId: env.storage.accessKeyId, secretAccessKey: env.storage.secretAccessKey }
      : undefined,
  // R2 no acepta las sumas de verificación automáticas que agregan las versiones nuevas del SDK
  // (recomendación oficial de Cloudflare): solo se calculan cuando la operación las exige.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const safeName = (name: string) => name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-120);

/**
 * URL firmada para que el navegador suba el archivo DIRECTO a S3.
 * El servidor nunca recibe el archivo: cero memoria/CPU consumidos aunque sea un video de 1 GB.
 */
export const presignUpload = async (opts: { bucket: string; prefix: string; fileName: string; contentType: string; size: number }) => {
  const key = `${opts.prefix}/${randomUUID()}-${safeName(opts.fileName)}`;
  // El tamaño va firmado: el navegador no puede subir más de lo que declaró (y se descontó del espacio).
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: opts.bucket, Key: key, ContentType: opts.contentType, ContentLength: opts.size }),
    { expiresIn: 900, signableHeaders: new Set(['content-type', 'content-length']) }
  );
  return { key, url };
};

/** Se muestran en el navegador solo imágenes, PDF, audio y video; el resto se descarga (nunca se interpreta). */
const INLINE = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|audio\/|video\/)/;

export const presignDownload = (bucket: string, key: string, expiresIn = 3600, file?: { name: string; mimeType: string }) =>
  getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(file
        ? {
            ResponseContentType: file.mimeType,
            ResponseContentDisposition: `${INLINE.test(file.mimeType) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          }
        : {}),
    }),
    { expiresIn }
  );

export const headObject = (bucket: string, key: string) => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
export const deleteObject = (bucket: string, key: string) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

/** Borra todos los objetos bajo una carpeta (ej: schools/12/). Devuelve cuántos borró. */
export const deletePrefix = async (bucket: string, prefix: string) => {
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }));
    const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
};
