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
    const io = req.app.get('io'); // Obtener socket.io

    const { userId, title, message, type, link } = req.body;

    if (!userId || !title || !message || !type) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const notification = await Notification.create({ title, message, type, link });

    const userNotification = await UserNotification.create({
      userId,
      notificationId: notification.id,
      read: false,
      seenAt: null,
    });

    // Emitir evento en tiempo real solo al usuario específico
    io.to(`user_${userId}`).emit('notification', {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      link: notification.link,
      createdAt: notification.createdAt,
      read: userNotification.read,
    });

    res.status(201).json({ message: 'Notificación enviada al usuario' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al enviar notificación', error });
  }
};


export const sendNotificationToAll = async (req: any, res: any) => {
  try {
    const io = req.app.get('io'); // Obtener socket.io

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

    // Emitir evento a todos los usuarios conectados uno por uno
    users.forEach((user) => {
      io.to(`user_${user.id}`).emit('notification', {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        read: false,
      });
    });

    res.status(201).json({ message: 'Notificación enviada a todos los usuarios' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al enviar notificación', error });
  }
};

