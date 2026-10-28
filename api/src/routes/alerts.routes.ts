import { Router } from 'express';
import * as AlertsController from '../controllers/alerts.controller';
import * as AlertsValidator from '../validators/alerts.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

// Estudiantes sin email: antes de cualquier /alerts/:id para que "no-email" no se tome como un id.
router.get('/alerts/no-email', authorize(Entity.ALERTS, Action.READ), validate(AlertsValidator.listNoEmail), AlertsController.listNoEmail);
router.post('/alerts/no-email/notify', authorize(Entity.ALERTS, Action.UPDATE), validate(AlertsValidator.notifyNoEmail), AlertsController.notifyNoEmail);
// Pedir al estudiante que cambie su email: quien ve los datos de contacto (conducción, preceptoría, secretaría).
router.post('/alerts/student-emails/request-change', authorize(Entity.CONTACT_INFO, Action.READ), validate(AlertsValidator.requestEmailChange), AlertsController.requestEmailChange);
router.get('/alerts', authorize(Entity.ALERTS, Action.READ), validate(AlertsValidator.listAlerts), AlertsController.listAlerts);
router.patch('/alerts/:id', authorize(Entity.ALERTS, Action.UPDATE), validate(AlertsValidator.updateAlert), AlertsController.updateAlert);
router.get('/alerts/rules', authorize(Entity.ALERTS, Action.READ), AlertsController.listRules);
router.post('/alerts/rules', authorize(Entity.ALERT_RULES, Action.UPDATE), validate(AlertsValidator.createRule), AlertsController.createRule);
router.patch('/alerts/rules/:id', authorize(Entity.ALERT_RULES, Action.UPDATE), validate(AlertsValidator.updateRule), AlertsController.updateRule);
router.delete('/alerts/rules/:id', authorize(Entity.ALERT_RULES, Action.UPDATE), validate(AlertsValidator.deleteRule), AlertsController.deleteRule);
router.post('/alerts/recompute', authorize(Entity.ALERT_RULES, Action.UPDATE), AlertsController.recomputeAlerts);

export default router;
