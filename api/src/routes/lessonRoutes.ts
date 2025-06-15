import express from 'express';
import { getCourseLessons } from '../controllers/lessonController';
import { checkPermission, isAuth } from '../middlewares/auth';
import { Action, Entity } from '../models/enums';

const router = express.Router();

router.get('/courses/:id/lessons', isAuth, checkPermission(Entity.LESSONS, Action.READ), getCourseLessons);

export default router;
