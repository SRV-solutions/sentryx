import { Router } from 'express';
import * as NotificationsController from '../controllers/notifications.controller';
import * as NotificationsValidator from '../validators/notifications.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

/** Campana de notificaciones propia y avisos masivos de la plataforma. */
const router = Router();

router.get('/', NotificationsController.listMyNotifications);
router.post('/read-all', NotificationsController.markAllAsRead);
router.patch('/:notificationId', validate(NotificationsValidator.markAsRead), NotificationsController.markAsRead);

// Avisos masivos (ej: mantenimiento programado): equipo de Sentryx.
router.post('/all', authorize(Entity.NOTIFICATIONS, Action.BROADCAST), validate(NotificationsValidator.sendToAll), NotificationsController.sendToAll);
router.post('/user', authorize(Entity.NOTIFICATIONS, Action.BROADCAST), validate(NotificationsValidator.sendToUser), NotificationsController.sendToUser);
router.post('/some', authorize(Entity.NOTIFICATIONS, Action.BROADCAST), validate(NotificationsValidator.sendToUsers), NotificationsController.sendToUsers);

export default router;
