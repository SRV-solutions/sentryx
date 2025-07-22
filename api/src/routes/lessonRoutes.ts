import express from 'express';
import { getCourseLessons, getCommentsByLesson, postCommentToLesson, updateLesson, saveLessonProgress } from '../controllers/lessonController';
import { checkPermission, isAuth } from '../middlewares/auth';
import { Action, Entity } from '../models/enums';

const router = express.Router();

router.get('/courses/:id/lessons', isAuth, checkPermission(Entity.LESSONS, Action.READ), getCourseLessons);
router.get('/:id/comments', isAuth, checkPermission(Entity.LESSONS, Action.READ), getCommentsByLesson);
router.post('/:id/comments', isAuth, checkPermission(Entity.LESSONS, Action.READ), postCommentToLesson);

router.put('/:id', isAuth, checkPermission(Entity.LESSONS, Action.UPDATE), updateLesson);
router.post('/:lessonId/progress', isAuth, checkPermission(Entity.LESSONS, Action.READ), saveLessonProgress);

// GET /lessons/:lessonId/comments → Listar todos los comentarios + rating de una lesson
// POST /lessons/:lessonId/comments → Crear un comentario nuevo con rating (requiere user autenticado)

export default router;
