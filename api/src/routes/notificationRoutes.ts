import { Router } from 'express';
import * as c from '../controllers/notificationController';
import { Entity, Action } from '../models/enums';
import { isAuth, checkPermission } from '../middlewares/auth';
import { asyncHandler as h } from '../lib/http';

const router = Router();

// Cualquier usuario autenticado ve y marca sus propias notificaciones.
router.get('/', isAuth, h(c.getUserNotifications));
router.post('/read-all', isAuth, h(c.markAllAsRead));
router.patch('/:notificationId', isAuth, h(c.markAsRead));

router.post('/all', isAuth, checkPermission(Entity.USERS, Action.CREATE), h(c.sendNotificationToAll));
router.post('/user', isAuth, checkPermission(Entity.USERS, Action.CREATE), h(c.sendNotificationToUser));
router.post('/some', isAuth, checkPermission(Entity.USERS, Action.CREATE), h(c.sendNotificationToSomeUsers));

export default router;
