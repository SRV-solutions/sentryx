import { Router } from 'express';
import * as AuditController from '../controllers/audit.controller';
import * as AuditValidator from '../validators/audit.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

/** Auditoría del colegio: actividad (con IP) y detalle de cambios e ingresos. */
const router = Router();

router.get('/audit/activity', authorize(Entity.AUDIT_LOG, Action.READ), validate(AuditValidator.listActivity), AuditController.listSchoolActivity);
router.get('/audit/changes', authorize(Entity.AUDIT_LOG, Action.READ), validate(AuditValidator.listChanges), AuditController.listSchoolChanges);

export default router;
