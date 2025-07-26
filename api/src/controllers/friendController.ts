import { Op } from 'sequelize';
import Friendship from '../models/Friendship';
import User from '../models/User';
import Notification from '../models/Notification';
import UserNotification from '../models/UserNotification';

export const getReceivedRequests = async (req: any, res: any) => {
  const userId = req.user?.id;

  try {
    const requests = await Friendship.findAll({
      where: {
        receiverId: userId,
        status: 'pending',
      },
      include: [{ model: User, as: 'requester', attributes: ['id', 'firstName', 'lastName', 'username', 'avatar'] }],
      order: [['createdAt', 'DESC']],
    });
    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener solicitudes recibidas', error });
  }
};

export const getSentRequests = async (req: any, res: any) => {
  const userId = req.user?.id;

  try {
    const requests = await Friendship.findAll({
      where: {
        requesterId: userId,
        status: 'pending',
      },
      include: [{ model: User, as: 'receiver', attributes: ['id', 'firstName', 'lastName', 'username', 'avatar'] }],
      order: [['createdAt', 'DESC']],
    });

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener solicitudes enviadas', error });
  }
};


export const getFriendStatus = async (req: any, res: any) => {
  const userId = req.user?.id;
  const otherUserId = parseInt(req.params.userId);

  if (!userId || !otherUserId || userId === otherUserId) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  try {
    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: userId, receiverId: otherUserId },
          { requesterId: otherUserId, receiverId: userId },
        ],
        status: {
          [Op.in]: ['pending', 'accepted'], // Solo relaciones activas
        },
      },
    });

    const isFriend = friendship?.status === 'accepted';
    const hasPendingRequest = friendship?.status === 'pending';

    return res.json({ isFriend, hasPendingRequest });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al verificar estado de amistad' });
  }
};


export const sendFriendRequest = async (req: any, res: any) => {
  const { userId } = req.params;
  const requesterId = req.user?.id;

  if (!userId || requesterId === userId) {
    return res.status(400).json({ message: 'ID inválido.' });
  }

  try {
    const [friendship, created] = await Friendship.findOrCreate({
      where: { requesterId, receiverId: userId },
      defaults: { status: 'pending' },
    });

    if (!created) {
      return res.status(409).json({ message: 'Ya existe una solicitud.' });
    }

    const user = await User.findByPk(requesterId)
    if (!user) {
      return res.status(409).json({ message: 'El usuario solicitante no existe' });
    }
    const notification = await Notification.create({
      title: 'Nueva solicitud de amistad',
      message: `${user.firstName} ${user.lastName} te ha enviado una solicitud de amistad.`,
      type: 'friend_request',
      link: '/friends/requests',  // <-- link a la página donde se ven solicitudes
    });

    await UserNotification.create({
      userId,
      notificationId: notification.id,
      read: false,
      seenAt: null,
    });

    // Emitir notificación por websocket si usas sockets (opcional)
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('notification', {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        read: false,
      });
    }

    res.status(201).json(friendship);
  } catch (error) {
    res.status(500).json({ message: 'Error al enviar solicitud', error });
  }
};

export const acceptFriendRequest = async (req: any, res: any) => {
  const { requestId } = req.params;
  const userId = req.user?.id;

  try {
    const friendship = await Friendship.findByPk(requestId);

    if (!friendship || friendship.receiverId !== userId) {
      return res.status(400).json({ message: 'No autorizado' });
    }

    friendship.status = 'accepted';
    await friendship.save();

    // Notificar al requester que aceptaron la solicitud
    const user = await User.findByPk(userId)
    if (!user) {
      return res.status(404).json({ message: 'El usuario solicitante no existe' });
    }
    const notification = await Notification.create({
      title: 'Solicitud de amistad aceptada',
      message: `${user.firstName} ${user.lastName} aceptó tu solicitud de amistad.`,
      type: 'friend_request_accepted',
      link: '/my-friends', // o a la página de amigos
    });

    await UserNotification.create({
      userId: friendship.requesterId,
      notificationId: notification.id,
      read: false,
      seenAt: null,
    });

    // Emitir por socket si usas
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${friendship.requesterId}`).emit('notification', {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        read: false,
      });
    }

    res.json(friendship);
  } catch (error) {
    res.status(500).json({ message: 'Error al aceptar', error });
  }
};

/**
 * Rechazar una solicitud
 */
export const rejectFriendRequest = async (req: any, res: any) => {
  const { requestId } = req.params;
  const userId = req.user?.id;

  try {
    const friendship = await Friendship.findByPk(requestId);

    if (!friendship || friendship.receiverId !== userId) {
      return res.status(400).json({ message: 'No autorizado' });
    }

    friendship.status = 'rejected';
    await friendship.save();

    res.json(friendship);
  } catch (error) {
    res.status(500).json({ message: 'Error al rechazar', error });
  }
};

/**
 * Cancelar una solicitud
 */
export const cancelFriendRequest = async (req: any, res: any) => {
  const { friendshipId } = req.params;
  const userId = req.user?.id;

  try {
    const friendship = await Friendship.findByPk(friendshipId);

    if (!friendship || friendship.requesterId !== userId) {
      return res.status(400).json({ message: 'No autorizado' });
    }

    friendship.status = 'cancelled';
    await friendship.save();

    res.json(friendship);
  } catch (error) {
    res.status(500).json({ message: 'Error al cancelar', error });
  }
};

/**
 * Eliminar a un amigo
 */
export const removeFriend = async (req: any, res: any) => {
  const { friendshipId } = req.params;
  const userId = req.user?.id;

  try {
    const friendship = await Friendship.findByPk(friendshipId);

    if (
      !friendship ||
      (friendship.requesterId !== userId && friendship.receiverId !== userId)
    ) {
      return res.status(400).json({ message: 'No autorizado' });
    }

    friendship.status = 'removed';
    await friendship.save();

    res.json({ message: 'Amistad eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar amistad', error });
  }
};


export const getMyFriends = async (req: any, res: any) => {
  const userId = req.user?.id;

  try {
    const friendships = await Friendship.findAll({
      where: { status: 'accepted' },
      include: [
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'firstName', 'lastName', 'username', 'email', 'avatar'],
        },
        {
          model: User,
          as: 'receiver',
          attributes: ['id', 'firstName', 'lastName', 'username', 'email', 'avatar'],
        },
      ],
    });

    // Filtrar las amistades donde el usuario está involucrado
    const userFriendships = friendships.filter(
      (f: any) => f.requester.id === userId || f.receiver.id === userId
    );

    // Mapear al amigo (que NO soy yo)
    const friends = userFriendships.map((f: any) => {
      return f.requester.id === userId ? f.receiver : f.requester;
    });

    res.json(friends);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener amigos', error });
  }
};

