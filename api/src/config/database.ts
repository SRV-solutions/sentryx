import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';
dotenv.config();

export const sequelize = new Sequelize({
    dialect: 'postgres',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'sentryx',
    logging: false,
});
