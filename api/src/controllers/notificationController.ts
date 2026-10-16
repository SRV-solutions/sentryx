import { Request, Response } from 'express';
import { z } from 'zod';
import { Notification, UserNotification, User } from '../models';
import { notify } from '../lib/notify';
import { notFound } from '../lib/http';

export const getUserNotifications = async (req: Request, res: Response) => {
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const notifications = await UserNotification.findAll({
    where: { userId: req.user!.id },
    include: [Notification],
    order: [['createdAt', 'DESC']],
    limit,
  });
  // Lista vacía = 200 con [] (antes devolvía 404 y el cliente lo trataba como error).
  res.json(notifications);
};

export const markAsRead = async (req: Request, res: Response) => {
  const [count] = await UserNotification.update(
    { read: true, seenAt: new Date() },
    { where: { userId: req.user!.id, notificationId: req.params.notificationId } }
  );
  if (!count) throw notFound('Notificación no encontrada');
  res.json({ message: 'Notificación marcada como leída' });
};

export const markAllAsRead = async (req: Request, res: Response) => {
  await UserNotification.update({ read: true, seenAt: new Date() }, { where: { userId: req.user!.id, read: false } });
  res.json({ ok: true });
};

export const notificationSchema = z.object({
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(2000),
  type: z.string().min(1).max(40),
  link: z.string().max(500).optional(),
});

export const sendNotificationToUser = async (req: Request, res: Response) => {
  const { userId, ...n } = notificationSchema.extend({ userId: z.number().int() }).parse(req.body);
  if (!(await User.count({ where: { id: userId } }))) throw notFound('Usuario no encontrado');
  notify({ userIds: [userId], ...n, email: 'never' });
  res.status(201).json({ message: 'Notificación enviada al usuario' });
};

/** Envío masivo: responde al instante y los emails salen por la cola (antes bloqueaba la request por minutos). */
export const sendNotificationToAll = async (req: Request, res: Response) => {
  const n = notificationSchema.parse(req.body);
  const users = await User.findAll({ where: { isActive: true }, attributes: ['id'], raw: true });
  notify({ userIds: users.map((u) => u.id), ...n, email: 'always' });
  res.status(201).json({ message: `Notificación en envío a ${users.length} usuarios` });
};

export const sendNotificationToSomeUsers = async (req: Request, res: Response) => {
  const { userIds, ...n } = notificationSchema.extend({ userIds: z.array(z.number().int()).min(1).max(5000) }).parse(req.body);
  const users = await User.findAll({ where: { id: userIds }, attributes: ['id'], raw: true });
  if (!users.length) throw notFound('Ningún usuario válido encontrado');
  notify({ userIds: users.map((u) => u.id), ...n, email: 'always' });
  res.status(201).json({ message: 'Notificación enviada a usuarios seleccionados' });
};
