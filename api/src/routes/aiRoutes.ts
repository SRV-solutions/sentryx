import { Router } from 'express';
import { chatWithGPT } from '../controllers/aiController';
import { isAuth } from '../middlewares/auth'; // si ya usas autenticación

const router = Router();

router.post('/chat', isAuth, chatWithGPT);

export default router;
