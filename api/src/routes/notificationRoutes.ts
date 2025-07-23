import { Router } from 'express';
import { getUserNotifications, markAsRead, sendNotificationToAll, sendNotificationToSomeUsers, sendNotificationToUser } from '../controllers/notificationController';
import { Entity, Action } from '../models/enums';
import { isAuth, checkPermission } from '../middlewares/auth';

const router = Router();

router.get(
  '/',
  isAuth,
  checkPermission(Entity.USERS, Action.READ),
  getUserNotifications
);

router.patch(
  '/:notificationId',
  isAuth,
  checkPermission(Entity.USERS, Action.READ),
  markAsRead
);

router.post(
  '/all',
  isAuth,
  checkPermission(Entity.USERS, Action.CREATE),
  sendNotificationToAll
);

router.post(
  '/user',
  isAuth,
  checkPermission(Entity.USERS, Action.CREATE),
  sendNotificationToUser
);

router.post(
  '/some',
  isAuth,
  checkPermission(Entity.USERS, Action.CREATE),
  sendNotificationToSomeUsers
);


export default router;