// src/routes/aiRoutes.js
import express from 'express';
import { chatWithGPT } from '../controllers/aiController.js';
import { isAuth } from '../middlewares/auth.js'; // si ya usas autenticación

const router = express.Router();

// POST /api/ai/chat
router.post('/chat', isAuth, chatWithGPT);

export default router;
