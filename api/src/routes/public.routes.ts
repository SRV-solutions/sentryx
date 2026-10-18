import { Router } from 'express';
import * as PublicController from '../controllers/public.controller';

const router = Router();

router.get('/schools/:slug', PublicController.getPublicSchool);

export default router;
