import { Router } from 'express';
import * as StaffRecordsController from '../controllers/staffRecords.controller';
import * as PayrollController from '../controllers/payroll.controller';
import * as Validator from '../validators/staffRecords.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { requireFeature } from '../middlewares/requireFeature';
import { requireStaff } from '../middlewares/schoolSession';
import { Entity, Action } from '../constants/permissions';
import { PlanFeature } from '../constants/plans';

/** Legajo del personal y recibos de sueldo (plan Profesional). */
const router = Router();
const records = requireFeature(PlanFeature.STAFF_RECORDS);
const payroll = requireFeature(PlanFeature.PAYROLL);

// --- Legajo: cargos, horas, turnos y horario ---
router.get('/staff-records', authorize(Entity.STAFF_RECORDS, Action.READ), records, StaffRecordsController.listStaffRecords);
router.get('/staff-records/me', requireStaff, records, StaffRecordsController.getMyRecord);
router.post('/staff-positions', authorize(Entity.STAFF_RECORDS, Action.UPDATE), records, validate(Validator.createPosition), StaffRecordsController.createPosition);
router.patch('/staff-positions/:id', authorize(Entity.STAFF_RECORDS, Action.UPDATE), records, validate(Validator.updatePosition), StaffRecordsController.updatePosition);
router.delete('/staff-positions/:id', authorize(Entity.STAFF_RECORDS, Action.UPDATE), records, validate(Validator.deletePosition), StaffRecordsController.deletePosition);

// --- Recibos de sueldo ---
router.get('/payroll', authorize(Entity.PAYROLL, Action.READ), payroll, validate(Validator.listReceipts), PayrollController.listReceipts);
router.get('/payroll/mine', requireStaff, payroll, PayrollController.listMyReceipts);
router.post('/payroll', authorize(Entity.PAYROLL, Action.CREATE), payroll, validate(Validator.createReceipt), PayrollController.createReceipt);
router.post('/payroll/bulk', authorize(Entity.PAYROLL, Action.CREATE), payroll, validate(Validator.createReceiptsInBulk), PayrollController.createReceiptsInBulk);
router.get('/payroll/:id/file', requireStaff, validate(Validator.receiptId), PayrollController.getReceiptFile);
router.post('/payroll/:id/acknowledge', requireStaff, payroll, validate(Validator.acknowledgeReceipt), PayrollController.acknowledgeReceipt);
router.delete('/payroll/:id', authorize(Entity.PAYROLL, Action.DELETE), payroll, validate(Validator.receiptId), PayrollController.deleteReceipt);

export default router;
