import { Sequelize, Options } from 'sequelize';
import { env } from './env';

const common: Options = {
  dialect: 'postgres',
  logging: false,
  pool: { max: env.DB_POOL_MAX, min: 0, idle: 10_000, acquire: 30_000 },
  dialectOptions: env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
};

export const sequelize = env.DATABASE_URL
  ? new Sequelize(env.DATABASE_URL, common)
  : new Sequelize({
      ...common,
      username: env.DB_USER,
      password: env.DB_PASSWORD,
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
    });
