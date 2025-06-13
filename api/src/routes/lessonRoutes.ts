import express from 'express';
import { getCourseLessons } from '../controllers/lessonController';
import { isAuth } from '../middlewares/auth';

const router = express.Router();

router.get('/courses/:id/lessons', isAuth, getCourseLessons);

export default router;
