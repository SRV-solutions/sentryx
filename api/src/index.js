// src/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import aiRoutes from './routes/aiRoutes.js';

dotenv.config();
const app = express();

// Middlewares
app.use(cors());                // habilita CORS
app.use(express.json());        // parsea JSON de req.body

// Montar rutas
app.use('/api/ai', aiRoutes);

// (Opcional) otras rutas: /auth, /students, /attendance, etc.

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
