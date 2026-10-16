import { Router } from 'express';
import * as c from '../controllers/userController';
import { Entity, Action } from '../models/enums';
import { isAuth, checkPermission } from '../middlewares/auth';
import { asyncHandler as h, validate, idParam } from '../lib/http';

const router = Router();
const USERS_ADMIN = checkPermission([Entity.USERS, Action.READ], [Entity.USERS, Action.CREATE]);

// Públicas
router.post('/login', validate({ body: c.loginSchema }), h(c.login));
router.post('/register', validate({ body: c.registerSchema }), h(c.register));
router.post('/request-password-reset', h(c.requestPasswordReset));
router.post('/reset-password', h(c.resetPassword));

// Perfil propio (antes de las rutas con :id para que no las capture /:id)
router.get('/profile', isAuth, h(c.getMyOwnUser));
router.get('/me', isAuth, h(c.getMyOwnUser));
router.patch('/me', isAuth, validate({ body: c.updateMeSchema }), h(c.updateMyOwnUser));
router.put('/change-password', isAuth, validate({ body: c.changePasswordSchema }), h(c.changeMyOwnPassword));

// Comunidad de cursos (requiere permisos sociales: no disponible para familias)
router.get('/search', isAuth, checkPermission(Entity.CHATS, Action.CREATE), h(c.searchUsers));
router.get('/public/:id', isAuth, checkPermission(Entity.CHATS, Action.READ), validate({ params: idParam }), h(c.getPublicUser));

// Administración global de SRV
router.get('/', isAuth, USERS_ADMIN, h(c.getAllUsers));
router.post('/', isAuth, checkPermission(Entity.USERS, Action.CREATE), validate({ body: c.createUserSchema }), h(c.createUser));
router.get('/:id', isAuth, USERS_ADMIN, validate({ params: idParam }), h(c.getUser));
router.patch('/update/:id', isAuth, checkPermission(Entity.USERS, Action.UPDATE), validate({ params: idParam, body: c.updateUserSchema }), h(c.updateUser));
router.put('/:id/change-password', isAuth, checkPermission(Entity.USERS, Action.UPDATE), validate({ params: idParam }), h(c.changePassword));
router.post('/:id/reset-password', isAuth, checkPermission(Entity.USERS, Action.UPDATE), validate({ params: idParam }), h(c.resetPasswordByAdmin));
router.get('/:id/courses', isAuth, checkPermission(Entity.USERS, Action.CREATE), validate({ params: idParam }), h(c.getUserCourses));
router.put('/:id/courses', isAuth, checkPermission(Entity.USERS, Action.CREATE), validate({ params: idParam }), h(c.syncUserCourses));
router.put('/:id/add/:courseId', isAuth, checkPermission(Entity.COURSES, Action.CREATE), h(c.addUserToCourse));

export default router;
