import { Router } from 'express';
import * as StructureController from '../controllers/structure.controller';
import * as StructureValidator from '../validators/structure.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';
import { requireStaff } from '../middlewares/schoolSession';

const router = Router();

router.get('/structure', requireStaff, StructureController.getStructure);
router.patch('/levels/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.updateLevel), StructureController.updateLevel);
router.post('/levels', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.createLevel), StructureController.createLevel);
router.post('/years/:id/current', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.setCurrentYear), StructureController.setCurrentYear);
router.post('/divisions', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.createDivision), StructureController.createDivision);
router.patch('/divisions/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.updateDivision), StructureController.updateDivision);
router.delete('/divisions/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.deleteDivision), StructureController.deleteDivision);
router.post('/subjects', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.createSubject), StructureController.createSubject);
router.patch('/subjects/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.updateSubject), StructureController.updateSubject);
router.post('/assignments', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.assignTeacher), StructureController.assignTeacher);
router.delete('/assignments/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.removeAssignment), StructureController.removeAssignment);
router.patch('/periods/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.updatePeriod), StructureController.updatePeriod);
router.post('/periods/:id/:action(close|reopen)', authorize(Entity.GRADING_PERIODS, Action.CLOSE), validate(StructureValidator.setPeriodStatus), StructureController.setPeriodStatus);

export default router;
