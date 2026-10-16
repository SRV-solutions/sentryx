import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

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

  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM_NAME: z.string().default('Sentryx · SRV'),

  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_VIDEO_BUCKET_NAME: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:soporte@wearesrv.com'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  DB_AI_NAME: z.string().optional(),
  EMBEDDING_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;
const isProd = data.NODE_ENV === 'production';

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
  pushEnabled: Boolean(data.VAPID_PUBLIC_KEY && data.VAPID_PRIVATE_KEY),
  mailEnabled: Boolean(data.SMTP_USER && data.SMTP_PASS),
};
