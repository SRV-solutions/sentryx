import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as PlansController from '../controllers/plans.controller';
import * as PlansValidator from '../validators/plans.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

/** Planes de cada persona (precio, espacio y funciones). Ver constants/plans.ts. */
const router = Router();

/** Pedidos de cambio de plan: 10 por hora por persona. */
const requestLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `plan-request:${req.user?.id}`,
  message: { message: 'Ya mandaste varios pedidos. Probá de nuevo en un rato.' },
});

router.get('/plans/catalog', PlansController.getCatalog);
router.get('/plans/mine', PlansController.getMyPlan);
router.post('/plans/requests', requestLimiter, validate(PlansValidator.createRequest), PlansController.createRequest);
router.get('/plans/approvers', PlansController.getApprovers);
// Ver y resolver pedidos: la Representante Legal (todos) o la conducción del nivel (los que le llegaron); el controlador decide.
router.get('/plans/requests', validate(PlansValidator.listRequests), PlansController.listRequests);
router.post('/plans/requests/:id/resolve', validate(PlansValidator.resolveRequest), PlansController.resolveRequest);
router.get('/plans/members', authorize(Entity.PLANS, Action.READ), validate(PlansValidator.listMembers), PlansController.listMembers);
router.put('/plans/members', authorize(Entity.PLANS, Action.UPDATE), validate(PlansValidator.changeMembersPlan), PlansController.changeMembersPlan);

export default router;
