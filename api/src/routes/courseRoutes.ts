import { Router } from 'express';
import { getCourseCatalog, getMyCourses, getMyCourseById, getMyCoursesAndLessonsById, getAllCourses, getCourseById, updateCourse } from '../controllers/courseController';
import { isAuth, checkPermission} from '../middlewares/auth';
import { Action, Entity } from '../models/enums';

const router = Router();

router.get('/catalogue', isAuth, checkPermission(Entity.COURSES, Action.READ), getCourseCatalog);
router.get('/me/:courseId', isAuth, checkPermission(Entity.COURSES, Action.READ), getMyCourseById);
router.get('/me/:courseId/module/:moduleId/lessons/:lessonId', isAuth, checkPermission(Entity.COURSES, Action.READ), checkPermission(Entity.LESSONS, Action.READ), getMyCoursesAndLessonsById);
router.get('/me', isAuth, checkPermission(Entity.COURSES, Action.READ), getMyCourses);

router.get('/', isAuth, checkPermission(Entity.COURSES, Action.CREATE), getAllCourses);
router.get('/:id', isAuth, checkPermission(Entity.COURSES, Action.CREATE), getCourseById);
router.put('/:id', isAuth, checkPermission(Entity.COURSES, Action.UPDATE), updateCourse);

export default router;
