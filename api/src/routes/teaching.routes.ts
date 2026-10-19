import { Router } from 'express';
import * as ProgramsController from '../controllers/programs.controller';
import * as QuizzesController from '../controllers/quizzes.controller';
import * as Validator from '../validators/programs.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { requireFeature } from '../middlewares/requireFeature';
import { Entity, Action } from '../constants/permissions';
import { PlanFeature } from '../constants/plans';

/**
 * Enseñanza (plan Integral): programas de las materias y juegos de preguntas.
 * Lo que hacen los estudiantes (responder una tarea) no depende de su plan: lo habilita el del docente.
 */
const router = Router();
const programs = requireFeature(PlanFeature.SUBJECT_PROGRAMS);
const quizzes = requireFeature(PlanFeature.QUIZZES);

// --- Programas ---
router.get('/programs', programs, validate(Validator.listPrograms), ProgramsController.listPrograms);
router.get('/programs/my-subjects', authorize(Entity.SUBJECT_PROGRAMS, Action.CREATE), programs, ProgramsController.listMySubjects);
router.get('/programs/units', ProgramsController.listMyUnits);
router.get('/programs/:id', programs, validate(Validator.programId), ProgramsController.getProgram);
router.post('/programs', authorize(Entity.SUBJECT_PROGRAMS, Action.CREATE), programs, validate(Validator.createProgram), ProgramsController.createProgram);
router.put('/programs/:id', authorize(Entity.SUBJECT_PROGRAMS, Action.CREATE), programs, validate(Validator.updateProgram), ProgramsController.updateProgram);
router.post('/programs/:id/publish', authorize(Entity.SUBJECT_PROGRAMS, Action.CREATE), programs, validate(Validator.publishProgram), ProgramsController.publishProgram);
router.delete('/programs/:id', authorize(Entity.SUBJECT_PROGRAMS, Action.CREATE), programs, validate(Validator.programId), ProgramsController.deleteProgram);

// --- Juegos (docente) ---
router.get('/quizzes', authorize(Entity.QUIZZES, Action.CREATE), quizzes, validate(Validator.listQuizzes), QuizzesController.listQuizzes);
router.get('/quizzes/:id', authorize(Entity.QUIZZES, Action.CREATE), quizzes, validate(Validator.quizId), QuizzesController.getQuiz);
router.post('/quizzes', authorize(Entity.QUIZZES, Action.CREATE), quizzes, validate(Validator.createQuiz), QuizzesController.createQuiz);
router.put('/quizzes/:id', authorize(Entity.QUIZZES, Action.CREATE), quizzes, validate(Validator.updateQuiz), QuizzesController.updateQuiz);
router.delete('/quizzes/:id', authorize(Entity.QUIZZES, Action.CREATE), quizzes, validate(Validator.quizId), QuizzesController.deleteQuiz);
router.post('/quizzes/:id/assignments', authorize(Entity.QUIZZES, Action.CREATE), quizzes, validate(Validator.assignQuiz), QuizzesController.assignQuiz);
router.get('/quizzes/:id/assignments', authorize(Entity.QUIZZES, Action.CREATE), quizzes, validate(Validator.quizId), QuizzesController.listAssignments);
router.get('/quiz-assignments/:id/results', authorize(Entity.QUIZZES, Action.CREATE), quizzes, validate(Validator.assignmentId), QuizzesController.getAssignmentResults);

// --- Juegos en vivo (docente que la abrió) ---
router.post('/quizzes/:id/live', authorize(Entity.QUIZZES, Action.CREATE), quizzes, validate(Validator.quizId), QuizzesController.createLiveGame);
router.get('/live-games/:id', authorize(Entity.QUIZZES, Action.CREATE), validate(Validator.gameId), QuizzesController.getLiveGame);
router.post('/live-games/:id/start', authorize(Entity.QUIZZES, Action.CREATE), validate(Validator.gameId), QuizzesController.controlLiveGame('start'));
router.post('/live-games/:id/next', authorize(Entity.QUIZZES, Action.CREATE), validate(Validator.gameId), QuizzesController.controlLiveGame('next'));
router.post('/live-games/:id/end', authorize(Entity.QUIZZES, Action.CREATE), validate(Validator.gameId), QuizzesController.controlLiveGame('end'));
router.delete('/live-games/:id/players/:playerId', authorize(Entity.QUIZZES, Action.CREATE), validate(Validator.kickPlayer), QuizzesController.kickPlayer);

// --- Estudiantes y familias ---
router.get('/quiz-assignments/mine', QuizzesController.listMyAssignments);
router.get('/quiz-assignments/:id/play', validate(Validator.assignmentId), QuizzesController.getAssignmentToPlay);
router.post('/quiz-assignments/:id/attempt', validate(Validator.submitAttempt), QuizzesController.submitAttempt);
router.get('/quiz-results/student/:id', validate(Validator.studentResults), QuizzesController.getStudentResults);

export default router;
