import { Router } from 'express';
import { getCourseCatalog, getMyCourses, getMyCourseById } from '../controllers/courseController';
import {isAuth} from '../middlewares/auth';

const router = Router();

router.get('/catalogue', isAuth, getCourseCatalog);
router.get('/me/:courseId', isAuth, getMyCourseById);
router.get('/me/courses', isAuth, getMyCourses); 

export default router;
