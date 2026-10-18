import { Router } from 'express';
import * as AttendanceController from '../controllers/attendance.controller';
import * as AttendanceValidator from '../validators/attendance.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.get('/attendance/division/:id', authorize(Entity.ATTENDANCE, Action.READ), validate(AttendanceValidator.getDivisionDay), AttendanceController.getDivisionDay);
router.put('/attendance/division/:id', authorize(Entity.ATTENDANCE, Action.UPDATE), validate(AttendanceValidator.saveDivisionDay), AttendanceController.saveDivisionDay);
router.patch('/attendance/:id', authorize(Entity.ATTENDANCE, Action.UPDATE), validate(AttendanceValidator.updateRecord), AttendanceController.updateRecord);
router.get('/attendance/student/:id', validate(AttendanceValidator.getStudentAttendance), AttendanceController.getStudentAttendance);
router.get('/attendance/summary/:id', authorize(Entity.ATTENDANCE, Action.READ), validate(AttendanceValidator.getDivisionSummary), AttendanceController.getDivisionSummary);
router.get('/attendance/today', authorize(Entity.ATTENDANCE, Action.READ), validate(AttendanceValidator.getTodayOverview), AttendanceController.getTodayOverview);

export default router;
