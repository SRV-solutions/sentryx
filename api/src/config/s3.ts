import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
export const presignUpload = async (opts: { bucket: string; prefix: string; fileName: string; contentType: string }) => {
  const key = `${opts.prefix}/${randomUUID()}-${safeName(opts.fileName)}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: opts.bucket, Key: key, ContentType: opts.contentType }),
    { expiresIn: 900 }
  );
  return { key, url };
};

export const presignDownload = (bucket: string, key: string, expiresIn = 3600) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });

export const headObject = (bucket: string, key: string) => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
export const deleteObject = (bucket: string, key: string) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
