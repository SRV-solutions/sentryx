import { Router } from 'express';
import * as StatsController from '../controllers/stats.controller';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

/** Panel de conducción: requiere ver asistencia Y notas (directivos, coordinación, preceptoría, secretaría). */
const router = Router();
router.get('/stats/overview', authorize(Entity.ATTENDANCE, Action.READ), authorize(Entity.GRADES, Action.READ), StatsController.getOverview);
router.get('/stats/division/:id', authorize(Entity.ATTENDANCE, Action.READ), authorize(Entity.GRADES, Action.READ), StatsController.getDivisionStats);

export default router;
