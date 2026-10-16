import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { env } from './env';

/** Cliente único (AWS SDK v3). Reutilizar conexiones ahorra latencia y memoria. */
export const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials:
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
      : undefined,
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
