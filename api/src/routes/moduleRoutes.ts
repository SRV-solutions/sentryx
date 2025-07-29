import { Router } from 'express';
import { createModule, updateModule } from '../controllers/moduleController';
import { isAuth, checkPermission} from '../middlewares/auth';
import { Action, Entity } from '../models/enums';

const router = Router();


router.post('/', isAuth, checkPermission(Entity.COURSES, Action.CREATE), createModule);
router.put('/:id', isAuth, checkPermission(Entity.COURSES, Action.UPDATE), updateModule);

export default router;
