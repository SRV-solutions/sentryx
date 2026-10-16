/**
 * Backup de PostgreSQL al bucket (R2/S3): `npm run db:backup` (lo corre el timer diario de systemd).
 * Usa pg_dump (viene con PostgreSQL) y el cliente S3 del proyecto: no hace falta instalar nada más.
 * Conserva los últimos BACKUP_KEEP backups (por defecto 30) y borra los más viejos.
 */
import { spawn } from 'child_process';
import { createGzip } from 'zlib';
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { s3 } from '../config/s3';

const bucket = env.backupBucket;
const keep = Number(process.env.BACKUP_KEEP ?? 30);

const dump = () =>
  new Promise<Buffer>((resolve, reject) => {
    const args = env.DATABASE_URL ? [env.DATABASE_URL] : ['-h', env.DB_HOST, '-p', String(env.DB_PORT), '-U', env.DB_USER, env.DB_NAME];
    const pg = spawn('pg_dump', ['--no-owner', '--format=plain', ...args], { env: { ...process.env, PGPASSWORD: env.DB_PASSWORD } });
    const gzip = createGzip({ level: 9 });
    const chunks: Buffer[] = [];
    let stderr = '';
    pg.stderr.on('data', (d) => (stderr += d));
    pg.stdout.pipe(gzip);
    gzip.on('data', (c: Buffer) => chunks.push(c));
    gzip.on('end', () => resolve(Buffer.concat(chunks)));
    pg.on('close', (code) => code !== 0 && reject(new Error(`pg_dump terminó con código ${code}: ${stderr}`)));
    pg.on('error', reject);
  });

const run = async () => {
  if (!bucket) throw new Error('Configurá R2_BACKUP_BUCKET (o R2_BUCKET).');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const key = `backups/sentryx_${stamp}.sql.gz`;
  const body = await dump();
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/gzip' }));
  console.log(`[backup] ${key} (${(body.length / 1024 / 1024).toFixed(1)} MB)`);

  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'backups/' }));
  const old = (list.Contents ?? [])
    .filter((o) => o.Key)
    .sort((a, b) => (a.Key! < b.Key! ? 1 : -1))
    .slice(keep);
  if (old.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: old.map((o) => ({ Key: o.Key! })) } }));
    console.log(`[backup] ${old.length} backups viejos eliminados`);
  }
};

run().catch((err) => {
  console.error('[backup] ERROR', err.message ?? err);
  process.exit(1);
});
