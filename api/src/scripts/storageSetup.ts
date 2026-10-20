/**
 * Configuración y prueba del almacenamiento (Cloudflare R2): `npm run storage:setup`
 *
 * 1. Muestra a qué endpoint y buckets apunta la API (sin las claves).
 * 2. Verifica que las credenciales tengan acceso a cada bucket.
 * 3. Aplica la política CORS del bucket de archivos con los orígenes del front (CORS_ORIGINS),
 *    necesaria porque el navegador sube y descarga DIRECTO del bucket.
 * 4. Sube, lee y borra un archivo de prueba.
 *
 * Con --no-cors no toca la política CORS (por si la administrás desde el panel de Cloudflare).
 */
import { HeadBucketCommand, PutBucketCorsCommand, GetBucketCorsCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { presignUpload } from '../config/s3';
import { env } from '../config/env';
import { s3 } from '../config/s3';

const step = (ok: boolean, message: string) => console.log(`  ${ok ? '✓' : '✗'} ${message}`);

const run = async () => {
  console.log('Almacenamiento');
  console.log(`  Proveedor : ${env.storage.isR2 ? 'Cloudflare R2' : env.storage.endpoint ? `S3 compatible (${env.storage.endpoint})` : 'Amazon S3'}`);
  console.log(`  Endpoint  : ${env.storage.endpoint ?? `s3.${env.AWS_REGION}.amazonaws.com`}`);
  console.log(`  Archivos  : ${env.filesBucket ?? '(sin configurar: R2_BUCKET)'}`);
  console.log(`  Backups   : ${env.backupBucket ?? '(sin configurar: R2_BACKUP_BUCKET)'}`);
  console.log(`  Reportes  : ${env.reportsBucket ?? '(sin configurar: R2_REPORTS_BUCKET — los reportes van solo con texto)'}`);
  if (!env.filesBucket || !env.storage.accessKeyId) {
    console.log('\n✗ Falta configurar R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET en el .env (ver DEPLOY.md, sección R2).');
    process.exit(1);
  }

  let failed = false;
  for (const bucket of [env.filesBucket, env.backupBucket, env.reportsBucket].filter((b, i, all): b is string => !!b && all.indexOf(b) === i)) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      step(true, `Acceso al bucket "${bucket}"`);
    } catch (err) {
      failed = true;
      step(false, `Sin acceso al bucket "${bucket}": ${(err as Error).name}. Revisá que exista y que el token tenga permiso Object Read & Write sobre él.`);
    }
  }
  if (failed) process.exit(1);

  if (!process.argv.includes('--no-cors')) {
    // Los navegadores suben directo a estos dos buckets: archivos de los colegios y adjuntos de reportes.
    for (const bucket of [env.filesBucket, env.reportsBucket].filter((b, i, all): b is string => !!b && all.indexOf(b) === i)) {
      await s3.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [{ AllowedOrigins: env.corsOrigins, AllowedMethods: ['GET', 'PUT', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 }],
          },
        })
      );
      const cors = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
      step(true, `CORS aplicado en "${bucket}" para: ${cors.CORSRules?.[0]?.AllowedOrigins?.join(', ')}`);
    }
  }

  const key = `healthcheck/${Date.now()}.txt`;
  await s3.send(new PutObjectCommand({ Bucket: env.filesBucket, Key: key, Body: 'sentryx', ContentType: 'text/plain' }));
  const read = await s3.send(new GetObjectCommand({ Bucket: env.filesBucket, Key: key }));
  const body = await read.Body?.transformToString();
  await s3.send(new DeleteObjectCommand({ Bucket: env.filesBucket, Key: key }));
  step(body === 'sentryx', 'Subir, leer y borrar un archivo de prueba');

  // Igual que la app: subida con URL firmada (el tamaño va firmado: subir más de lo declarado tiene que fallar).
  const signed = await presignUpload({ bucket: env.filesBucket, prefix: 'healthcheck', fileName: 'firmado.txt', contentType: 'text/plain', size: 7 });
  const okPut = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'sentryx' });
  const tooBig = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'sentryx-de-mas' }).catch(() => null);
  await s3.send(new DeleteObjectCommand({ Bucket: env.filesBucket, Key: signed.key }));
  step(okPut.ok, 'Subida con URL firmada (como desde el navegador)');
  step(!tooBig?.ok, 'Rechaza un archivo más grande que el declarado');
  if (!okPut.ok || tooBig?.ok) process.exitCode = 1;
  console.log('\n✅ Almacenamiento listo: los docentes ya pueden subir materiales y adjuntos.');
};

run().catch((err) => {
  console.error('❌', err.message ?? err);
  process.exit(1);
});
