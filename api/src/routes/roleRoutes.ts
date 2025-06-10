import { Router } from 'express';
import { getRole, createRole, getRoles } from '../controllers/roleController';
import { isAuth, checkPermission } from '../middlewares/auth';
import { Entity, Action } from '../models/enums';

const router = Router();

router.get('/:id', isAuth, checkPermission(Entity.USERS, Action.READ), getRole);
router.get('/', isAuth, checkPermission(Entity.USERS, Action.READ), getRoles);
router.post('/', isAuth, checkPermission(Entity.USERS, Action.CREATE), createRole);

export default router;
