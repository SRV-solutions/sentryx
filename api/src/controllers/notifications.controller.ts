/** Campana de notificaciones propia y avisos masivos (routes/notifications.routes.ts). */
import { Notification, UserNotification, User } from '../models';
import { notify } from '../services/notifications';
import { asyncHandler, notFound } from '../lib/http';

interface BroadcastBody {
  title: string;
  message: string;
  type: string;
  link?: string;
}

// GET /notifications
export const listMyNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const notifications = await UserNotification.findAll({
    where: { userId: req.user!.id },
    include: [Notification],
    order: [['createdAt', 'DESC']],
    limit,
  });
  res.json(notifications);
});

// PATCH /notifications/:notificationId
export const markAsRead = asyncHandler(async (req, res) => {
  const [count] = await UserNotification.update(
    { read: true, seenAt: new Date() },
    { where: { userId: req.user!.id, notificationId: req.params.notificationId } }
  );
  if (!count) throw notFound('Notificación no encontrada');
  res.json({ message: 'Notificación marcada como leída' });
});

// POST /notifications/read-all
export const markAllAsRead = asyncHandler(async (req, res) => {
  await UserNotification.update({ read: true, seenAt: new Date() }, { where: { userId: req.user!.id, read: false } });
  res.json({ ok: true });
});

// POST /notifications/user
export const sendToUser = asyncHandler(async (req, res) => {
  const { userId, ...notification } = req.body as BroadcastBody & { userId: number };
  if (!(await User.count({ where: { id: userId } }))) throw notFound('Usuario no encontrado');
  notify({ userIds: [userId], ...notification, email: 'never' });
  res.status(201).json({ message: 'Notificación enviada al usuario' });
});

/** POST /notifications/all — responde al instante; los emails salen por la cola. */
export const sendToAll = asyncHandler(async (req, res) => {
  const notification = req.body as BroadcastBody;
  const users = await User.findAll({ where: { isActive: true }, attributes: ['id'], raw: true });
  notify({ userIds: users.map((user) => user.id), ...notification, email: 'always' });
  res.status(201).json({ message: `Notificación en envío a ${users.length} usuarios` });
});

// POST /notifications/some
export const sendToUsers = asyncHandler(async (req, res) => {
  const { userIds, ...notification } = req.body as BroadcastBody & { userIds: number[] };
  const users = await User.findAll({ where: { id: userIds }, attributes: ['id'], raw: true });
  if (!users.length) throw notFound('Ningún usuario válido encontrado');
  notify({ userIds: users.map((user) => user.id), ...notification, email: 'always' });
  res.status(201).json({ message: 'Notificación enviada a usuarios seleccionados' });
});
