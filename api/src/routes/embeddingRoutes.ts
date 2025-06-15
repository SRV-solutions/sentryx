import { Router } from 'express';
import { uploadDocument } from '../controllers/embeddingController';
import { verifyEmbeddingToken } from '../middlewares/auth';
const router = Router();

router.post('/upload', verifyEmbeddingToken, uploadDocument);

export default router;
