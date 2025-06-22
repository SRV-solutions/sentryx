import Notification from '../models/Notification';
import UserNotification from '../models/UserNotification';
import User from '../models/User';

export const getUserNotifications = async (req: any, res: any) => {
  try {
    const userId = req.user?.id; // Suponiendo que estás usando middleware JWT

    const notifications = await UserNotification.findAll({
      where: { userId },
      include: [Notification],
      order: [['createdAt', 'DESC']],
    });

    if (!notifications.length) {
      return res.status(404).json({ message: 'No hay notificaciones disponibles.' });
    }

    res.json(notifications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener notificaciones', error });
  }
};

export const markAsRead = async (req: any, res: any) => {
  try {
    const userId = req.user?.id;
    const { notificationId } = req.params;

    const record = await UserNotification.findOne({
      where: { userId, notificationId },
    });

    if (!record) {
      return res.status(404).json({ message: 'Notificación no encontrada' });
    }

    record.read = true;
    record.seenAt = new Date();
    await record.save();

    res.json({ message: 'Notificación marcada como leída' });
  } catch (error) {
    res.status(500).json({ message: 'Error al marcar como leída', error });
  }
};

export const sendNotificationToUser = async (req: any, res: any) => {
  try {
    const io = req.app.get('io'); // Asegurate de haber seteado app.set('io', io);

    const { userId, title, message, type, link } = req.body;

    if (!userId || !title || !message || !type) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const notification = await Notification.create({ title, message, type, link });

    await UserNotification.create({
      userId,
      notificationId: notification.id,
      read: false,
      seenAt: null,
    });

    const payload = {
      id: notification.id,
      title,
      message,
      type,
      link,
      createdAt: notification.createdAt,
      read: false,
    };

    io.to(`user_${userId}`).emit('notification', payload);

    return res.status(201).json({ message: 'Notificación enviada al usuario', notification: payload });
  } catch (error) {
    console.error('[sendNotificationToUser]', error);
    res.status(500).json({ message: 'Error al enviar notificación', error});
  }
};

export const sendNotificationToAll = async (req: any, res: any) => {
  try {
    const io = req.app.get('io');

    const { title, message, type, link } = req.body;

    if (!title || !message || !type) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    const notification = await Notification.create({ title, message, type, link });

    const users = await User.findAll({ attributes: ['id'] });

    const userNotifications = users.map((user) => ({
      userId: user.id,
      notificationId: notification.id,
      read: false,
      seenAt: null,
    }));

    await UserNotification.bulkCreate(userNotifications);

    const payload = {
      id: notification.id,
      title,
      message,
      type,
      link,
      createdAt: notification.createdAt,
      read: false,
    };

    users.forEach((user) => {
      io.to(`user_${user.id}`).emit('notification', payload);
    });

    res.status(201).json({ message: 'Notificación enviada a todos los usuarios' });
  } catch (error) {
    console.error('[sendNotificationToAll]', error);
    res.status(500).json({ message: 'Error al enviar notificación', error});
  }
};

