import { Router } from 'express';
import {
  getAllUsers,
  getUser,
  createUser,
  register,
  login,
  getMyOwnUser,
  updateUser,
  changePassword,
  updateMyOwnUser,
  changeMyOwnPassword,
  resetPasswordByAdmin,
  getUserCourses,
  syncUserCourses,
  requestPasswordReset,
  resetPassword,
  searchUsers,
  getPublicUser
} from '../controllers/userController';
import { Entity, Action } from '../models/enums';
import { isAuth, checkPermission } from '../middlewares/auth';

const router = Router();

// Rutas para usuarios
router.post('/login', login);
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);


router.get('/search', isAuth, checkPermission(Entity.USERS, Action.READ), searchUsers); // Podés agregar checkPermission si querés limitarlo
router.get('/', isAuth, checkPermission(Entity.USERS, Action.READ), checkPermission(Entity.USERS, Action.CREATE), getAllUsers);
router.get('/:id', isAuth, checkPermission(Entity.USERS, Action.READ), checkPermission(Entity.USERS, Action.CREATE), getUser);
router.post('/', isAuth, checkPermission(Entity.USERS, Action.CREATE), createUser);
router.post('/register', isAuth, checkPermission(Entity.USERS, Action.CREATE), register);
router.patch('/update/:id', isAuth, checkPermission(Entity.USERS, Action.UPDATE), updateUser)
router.put('/:id/change-password', isAuth, checkPermission(Entity.USERS, Action.UPDATE), changePassword);
router.post('/:id/reset-password', isAuth, checkPermission(Entity.USERS, Action.UPDATE), resetPasswordByAdmin);
router.get('/:id/courses', isAuth, checkPermission(Entity.USERS, Action.CREATE), getUserCourses);
router.put('/:id/courses', isAuth, checkPermission(Entity.USERS, Action.CREATE), syncUserCourses);


router.get('/public/:id', isAuth, checkPermission(Entity.USERS, Action.READ), getPublicUser);
router.get('/profile', isAuth, checkPermission(Entity.USERS, Action.READ), getMyOwnUser);
router.patch('/me', isAuth, checkPermission(Entity.USERS, Action.READ), updateMyOwnUser)
router.put('/change-password', isAuth, checkPermission(Entity.USERS, Action.READ), changeMyOwnPassword);


export default router;