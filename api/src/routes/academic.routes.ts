import { Router } from 'express';
import * as AcademicController from '../controllers/academic.controller';
import * as AcademicValidator from '../validators/academic.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { requireStaff } from '../middlewares/schoolSession';
import { Entity, Action } from '../constants/permissions';

/** Configuración académica (estructura, períodos, ciclos) y recorrido de los alumnos (cambio de curso, bajas, promoción). */
const router = Router();

// Estructura y ciclo lectivo (alcance sobre toda la institución)
router.post('/structure/defaults', authorize(Entity.SCHOOL, Action.UPDATE), validate(AcademicValidator.createDefaultStructure), AcademicController.createDefaultStructure);
router.get('/periods/suggested-ranges', authorize(Entity.SCHOOL, Action.UPDATE), validate(AcademicValidator.suggestedRanges), AcademicController.getSuggestedRanges);
router.post('/periods/summaries', authorize(Entity.SCHOOL, Action.UPDATE), validate(AcademicValidator.summaryPeriods), AcademicController.addSummaryPeriods);
router.delete('/periods/summaries', authorize(Entity.SCHOOL, Action.UPDATE), validate(AcademicValidator.summaryPeriods), AcademicController.removeSummaryPeriods);
router.post('/periods/scheme', authorize(Entity.SCHOOL, Action.UPDATE), validate(AcademicValidator.applyGradingScheme), AcademicController.applyGradingScheme);
router.post('/years', authorize(Entity.SCHOOL, Action.UPDATE), validate(AcademicValidator.createAcademicYear), AcademicController.createAcademicYear);

// Alumnos: cambio de curso, baja y reincorporación
router.get('/students/leave-reasons', requireStaff, AcademicController.listLeaveReasons);
router.post('/students/transfer', authorize(Entity.USERS, Action.UPDATE), validate(AcademicValidator.transferStudents), AcademicController.transferStudents);
router.post('/students/:id/withdraw', authorize(Entity.USERS, Action.UPDATE), validate(AcademicValidator.withdrawStudent), AcademicController.withdrawStudent);
router.post('/students/:id/reactivate', authorize(Entity.USERS, Action.UPDATE), validate(AcademicValidator.reactivateStudent), AcademicController.reactivateStudent);

// Promoción anual (alcance sobre toda la institución)
router.get('/promotions/plan', authorize(Entity.SCHOOL, Action.UPDATE), validate(AcademicValidator.promotionPlan), AcademicController.getPromotionPlan);
router.post('/promotions', authorize(Entity.SCHOOL, Action.UPDATE), validate(AcademicValidator.applyPromotion), AcademicController.applyPromotion);

export default router;
