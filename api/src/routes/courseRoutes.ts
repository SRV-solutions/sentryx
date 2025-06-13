import { Router } from 'express';
import { getCourseCatalog, getMyCourses, getMyCourseById, getMyCoursesAndLessonsById } from '../controllers/courseController';
import { isAuth } from '../middlewares/auth';

const router = Router();

router.get('/catalogue', isAuth, getCourseCatalog);
router.get('/me/:courseId', isAuth, getMyCourseById);
router.get('/me/:courseId/lessons/:lessonId', isAuth, getMyCoursesAndLessonsById);
router.get('/me', isAuth, getMyCourses); 

export default router;
