import { Router } from 'express';
import { forbidden } from '../lib/http';
import * as StructureController from '../controllers/structure.controller';
import * as StructureValidator from '../validators/structure.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';
import { requireStaff } from '../middlewares/schoolSession';

const router = Router();

router.get('/structure', requireStaff, StructureController.getStructure);
// Configuración de calificación: también la conducción del nivel (grading_periods:update); el controlador acota al alcance.
router.patch('/levels/:id', authorize(Entity.GRADING_PERIODS, Action.UPDATE), validate(StructureValidator.updateLevel), StructureController.updateLevel);
router.post('/levels/:id/grading-mode/apply', authorize(Entity.GRADING_PERIODS, Action.UPDATE), validate(StructureValidator.applyGradingMode), StructureController.applyGradingMode);
router.post('/levels', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.createLevel), StructureController.createLevel);
router.post('/years/:id/current', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.setCurrentYear), StructureController.setCurrentYear);
// Crear cursos: quien configura la institución, o la conducción de un nivel en su nivel (lo controla el controlador).
router.post('/divisions', (req, _res, next) => next(req.schoolSession?.can(Entity.SCHOOL, Action.UPDATE) || req.schoolSession?.courseLevelIds.length ? undefined : forbidden('No tenés permiso para crear cursos.')), validate(StructureValidator.createDivision), StructureController.createDivision);
router.patch('/divisions/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.updateDivision), StructureController.updateDivision);
router.delete('/divisions/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.deleteDivision), StructureController.deleteDivision);
router.post('/subjects', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.createSubject), StructureController.createSubject);
router.patch('/subjects/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.updateSubject), StructureController.updateSubject);
router.post('/assignments', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.assignTeacher), StructureController.assignTeacher);
router.delete('/assignments/:id', authorize(Entity.SCHOOL, Action.UPDATE), validate(StructureValidator.removeAssignment), StructureController.removeAssignment);
router.patch('/periods/:id', authorize(Entity.GRADING_PERIODS, Action.UPDATE), validate(StructureValidator.updatePeriod), StructureController.updatePeriod);
router.post('/periods/:id/:action(close|reopen)', authorize(Entity.GRADING_PERIODS, Action.CLOSE), validate(StructureValidator.setPeriodStatus), StructureController.setPeriodStatus);

export default router;
