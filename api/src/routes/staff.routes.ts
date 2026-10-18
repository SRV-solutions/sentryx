import { Router } from 'express';
import * as StaffController from '../controllers/staff.controller';
import * as StaffValidator from '../validators/staff.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.get('/staff', authorize(Entity.USERS, Action.READ), StaffController.listStaff);
router.post('/staff', authorize(Entity.USERS, Action.CREATE), validate(StaffValidator.createStaffMember), StaffController.createStaffMember);
router.post('/staff/import', authorize(Entity.USERS, Action.CREATE), validate(StaffValidator.importStaff), StaffController.importStaff);
router.patch('/staff/:id', authorize(Entity.USERS, Action.UPDATE), validate(StaffValidator.updateStaffRole), StaffController.updateStaffRole);

export default router;
