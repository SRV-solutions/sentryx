import openai from '../utils/openai';
import { Pool } from 'pg';
import pgvector from 'pgvector/pg';

export const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_AI_NAME,
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const insertDocumentEmbedding = async (text: string) => {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  const embedding = response.data[0].embedding;

  await pool.query(
    'INSERT INTO documents (content, embedding) VALUES ($1, $2)',
    [text, pgvector.toSql(embedding)]
  );
};
