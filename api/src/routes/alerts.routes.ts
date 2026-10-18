import { Router } from 'express';
import * as AlertsController from '../controllers/alerts.controller';
import * as AlertsValidator from '../validators/alerts.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.get('/alerts', authorize(Entity.ALERTS, Action.READ), validate(AlertsValidator.listAlerts), AlertsController.listAlerts);
router.patch('/alerts/:id', authorize(Entity.ALERTS, Action.UPDATE), validate(AlertsValidator.updateAlert), AlertsController.updateAlert);
router.get('/alerts/rules', authorize(Entity.ALERTS, Action.READ), AlertsController.listRules);
router.post('/alerts/rules', authorize(Entity.ALERT_RULES, Action.UPDATE), validate(AlertsValidator.createRule), AlertsController.createRule);
router.patch('/alerts/rules/:id', authorize(Entity.ALERT_RULES, Action.UPDATE), validate(AlertsValidator.updateRule), AlertsController.updateRule);
router.delete('/alerts/rules/:id', authorize(Entity.ALERT_RULES, Action.UPDATE), validate(AlertsValidator.deleteRule), AlertsController.deleteRule);
router.post('/alerts/recompute', authorize(Entity.ALERT_RULES, Action.UPDATE), AlertsController.recomputeAlerts);

export default router;
