import { Router } from 'express';
import { uploadDocument } from '../controllers/embeddingController';

import { isAuth, checkPermission } from '../middlewares/auth';
import { Action, Entity } from '../models/enums';

const router = Router();

router.post('/upload', isAuth, checkPermission(Entity.USERS, Action.CREATE), uploadDocument);

export default router;
