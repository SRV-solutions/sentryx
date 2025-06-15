const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'este',
    host: process.env.DB_HOST || '127.0.0.1',
    dialect: 'postgres',
  }
};
