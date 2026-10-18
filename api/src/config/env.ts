import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  /** Interfaz de red donde escucha la API. En producción 127.0.0.1: solo se llega a través de Caddy (HTTPS). */
  HOST: z.string().default('0.0.0.0'),
  /**
   * Claves para clientes que no son el navegador (futura app móvil, scripts de soporte), separadas por coma.
   * Se mandan en el header X-Client-Key. El navegador se identifica por su Origin (CORS_ORIGINS).
   */
  CLIENT_APP_KEYS: z.string().default(''),

  DATABASE_URL: z.string().optional(),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('sentryx'),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_POOL_MAX: z.coerce.number().default(10),
  /** Solo desarrollo: crea las tablas faltantes con sequelize.sync() (nunca borra). */
  DB_SYNC: z.enum(['true', 'false']).default('false'),

  JWT_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,https://sentryx.wearesrv.com'),
  FRONTEND_URL: z.string().default('https://sentryx.wearesrv.com'),

  /** Vacío = Gmail. Para Brevo: smtp-relay.brevo.com · SES: email-smtp.<región>.amazonaws.com */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  /** Remitente si difiere del usuario SMTP (Brevo/SES usan usuarios técnicos). */
  MAIL_FROM: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM_NAME: z.string().default('Sentryx'),

  // --- Almacenamiento: Cloudflare R2 (recomendado: descargas gratis, 10 GB sin cargo) ---
  /** ID de cuenta de Cloudflare: arma solo el endpoint https://<id>.r2.cloudflarestorage.com */
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  /** Un solo bucket para todo, separado por carpetas: schools/ (escolar), lessons/ (videos de cursos), reports/. */
  R2_BUCKET: z.string().optional(),
  /** Bucket de backups (recomendado aparte). Si falta, usa R2_BUCKET con la carpeta backups/. */
  R2_BACKUP_BUCKET: z.string().optional(),

  // --- Compatibilidad: AWS S3 u otro proveedor S3 (solo si no se usa R2) ---
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  /** Endpoint S3-compatible (ej: Cloudflare R2 https://<cuenta>.r2.cloudflarestorage.com). Vacío = AWS S3. */
  S3_ENDPOINT: z.string().url().optional(),
  /** Bucket de archivos escolares (materiales, adjuntos). Si falta se usa S3_BUCKET_NAME. */
  S3_FILES_BUCKET: z.string().optional(),
  /** Cuota de almacenamiento por escuela en MB (configurable por escuela después). */
  STORAGE_QUOTA_MB: z.coerce.number().default(20480),
  FILE_MAX_MB: z.coerce.number().default(25),
  VIDEO_MAX_MB: z.coerce.number().default(300),

  /** embedded: sockets dentro de la API (desarrollo). remote: servidor de tiempo real aparte (producción). */
  REALTIME_MODE: z.enum(['embedded', 'remote']).default('embedded'),
  /** URL interna del servidor de tiempo real (ej: http://127.0.0.1:3001 en el mismo VPS). */
  REALTIME_URL: z.string().url().default('http://127.0.0.1:3001'),
  /** Secreto compartido API ↔ tiempo real (openssl rand -hex 32). */
  REALTIME_SECRET: z.string().min(16).optional(),
  REALTIME_PORT: z.coerce.number().default(3001),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:soporte@wearesrv.com'),

  /** Precio mensual por usuario activo (ARS). Se congela en cada liquidación cerrada. */
  BILLING_PRICE_ARS: z.coerce.number().positive().default(660),
  /** Zona horaria de los cortes de ciclo (mes calendario). */
  BILLING_TZ_OFFSET: z.string().regex(/^[+-]\d{2}:\d{2}$/).default('-03:00'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;
const isProd = data.NODE_ENV === 'production';

if (data.REALTIME_MODE === 'remote' && !data.REALTIME_SECRET) {
  console.error('❌ REALTIME_SECRET es obligatorio con REALTIME_MODE=remote.');
  process.exit(1);
}

if (isProd && !data.JWT_SECRET) {
  console.error('❌ JWT_SECRET es obligatorio en producción (mínimo 16 caracteres).');
  process.exit(1);
}

export const env = {
  ...data,
  isProd,
  // En desarrollo se usa un secreto efímero: los tokens se invalidan al reiniciar, nunca uno fijo y conocido.
  JWT_SECRET: data.JWT_SECRET ?? require('crypto').randomBytes(32).toString('hex'),
  corsOrigins: data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  clientAppKeys: data.CLIENT_APP_KEYS.split(',').map((k) => k.trim()).filter((k) => k.length >= 24),
  storage: {
    endpoint: data.S3_ENDPOINT ?? (data.R2_ACCOUNT_ID ? `https://${data.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined),
    accessKeyId: data.R2_ACCESS_KEY_ID ?? data.AWS_ACCESS_KEY_ID,
    secretAccessKey: data.R2_SECRET_ACCESS_KEY ?? data.AWS_SECRET_ACCESS_KEY,
    isR2: Boolean(data.R2_ACCOUNT_ID || data.S3_ENDPOINT?.includes('r2.cloudflarestorage.com')),
  },
  filesBucket: data.R2_BUCKET ?? data.S3_FILES_BUCKET ?? data.S3_BUCKET_NAME,
  backupBucket: data.R2_BACKUP_BUCKET ?? process.env.S3_BACKUP_BUCKET ?? data.R2_BUCKET ?? data.S3_FILES_BUCKET,
  pushEnabled: Boolean(data.VAPID_PUBLIC_KEY && data.VAPID_PRIVATE_KEY),
  mailEnabled: Boolean(data.SMTP_USER && data.SMTP_PASS),
};
