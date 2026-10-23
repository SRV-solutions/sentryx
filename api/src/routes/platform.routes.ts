import { Router } from 'express';
import * as PlatformController from '../controllers/platform.controller';
import * as PlatformValidator from '../validators/platform.validator';
import * as SupportController from '../controllers/support.controller';
import * as SupportValidator from '../validators/support.validator';
import * as AuditController from '../controllers/audit.controller';
import * as AuditValidator from '../validators/audit.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

/** Consola de la plataforma Sentryx: colegios y facturación de todos (rol de plataforma SUPERADMIN). */
const router = Router();

router.get('/schools', authorize(Entity.SCHOOLS, Action.READ), PlatformController.listSchools);
router.post('/schools', authorize(Entity.SCHOOLS, Action.CREATE), validate(PlatformValidator.registerSchool), PlatformController.registerSchool);
router.patch('/schools/:id', authorize(Entity.SCHOOLS, Action.UPDATE), validate(PlatformValidator.updateSchool), PlatformController.updateSchool);
router.get('/schools/:id/deletion', authorize(Entity.SCHOOLS, Action.DELETE), validate(PlatformValidator.deletionSummary), PlatformController.getDeletionSummary);
router.delete('/schools/:id', authorize(Entity.SCHOOLS, Action.DELETE), validate(PlatformValidator.deleteSchool), PlatformController.deleteSchool);
router.get('/superadmins', authorize(Entity.SCHOOLS, Action.CREATE), PlatformController.listSuperadmins);
router.post('/superadmins', authorize(Entity.SCHOOLS, Action.CREATE), validate(PlatformValidator.createSuperadmin), PlatformController.createSuperadmin);
router.get('/billing', authorize(Entity.PLATFORM_BILLING, Action.READ), validate(PlatformValidator.getPlatformBilling), PlatformController.getPlatformBilling);

// Reportes de problemas de los usuarios
router.get('/support-reports', authorize(Entity.SUPPORT_REPORTS, Action.READ), validate(SupportValidator.listReports), SupportController.listReports);
router.patch('/support-reports/:id', authorize(Entity.SUPPORT_REPORTS, Action.UPDATE), validate(SupportValidator.updateReport), SupportController.updateReport);

// Auditoría de toda la plataforma (ingresos, cambios sensibles, IPs)
router.get('/activity', authorize(Entity.PLATFORM_AUDIT, Action.READ), validate(AuditValidator.listActivity), AuditController.listPlatformActivity);

export default router;
