import { Router } from 'express';
import { uploadFileToS3 } from '../controllers/reportsController';
import { isAuth } from '../middlewares/auth';

const router = Router();

router.post('/upload-file', isAuth, uploadFileToS3);

export default router;
