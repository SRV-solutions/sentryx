import FriendRequest from '../models/Friendship';
import User from '../models/User';
import { Op } from 'sequelize';

export const sendFriendRequest = async (req: any, res: any) => {
  const requesterId = req.user.id;
  const receiverId = parseInt(req.params.userId);

  if (requesterId === receiverId) {
    return res.status(400).json({ error: 'No podés enviarte solicitud a vos mismo' });
  }

  const exists = await FriendRequest.findOne({
    where: {
      [Op.or]: [
        { requesterId, receiverId },
        { requesterId: receiverId, receiverId: requesterId }
      ]
    }
  });

  if (exists) {
    return res.status(400).json({ error: 'Ya existe una solicitud o amistad entre estos usuarios' });
  }

  const request = await FriendRequest.create({ requesterId, receiverId });
  res.json(request);
};

export const acceptFriendRequest = async (req: any, res: any) => {
  const { requestId } = req.params;
  const request = await FriendRequest.findByPk(requestId);

  if (!request || request.receiverId !== req.user.id) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }

  request.status = 'accepted';
  await request.save();
  res.json({ message: 'Solicitud aceptada', request });
};

export const rejectFriendRequest = async (req: any, res: any) => {
  const { requestId } = req.params;
  const request = await FriendRequest.findByPk(requestId);

  if (!request || request.receiverId !== req.user.id) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }

  request.status = 'rejected';
  await request.save();
  res.json({ message: 'Solicitud rechazada', request });
};

export const getMyFriends = async (req: any, res: any) => {
  const userId = req.user.id;

  const friends = await FriendRequest.findAll({
    where: {
      status: 'accepted',
      [Op.or]: [
        { requesterId: userId },
        { receiverId: userId }
      ]
    },
    include: [
      { model: User, as: 'requester', attributes: ['id', 'fistName', 'lastName', 'username'] },
      { model: User, as: 'receiver', attributes: ['id', 'fistName', 'lastName', 'username'] }
    ]
  });

  const formatted = friends.map((fr: any) => {
    const friend = fr.requesterId === userId ? fr.receiver : fr.requester;
    return {
      id: friend.id,
      username: friend.username,
      name: `${friend.fistName} ${friend.lastName}`,
    };
  });

  res.json(formatted);
};

export const searchUsers = async (req: any, res: any) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Falta el parámetro de búsqueda' });
  }

  const users = await User.findAll({
    where: {
      [Op.or]: [
        { fistName: { [Op.iLike]: `%${q}%` } },
        { lastName: { [Op.iLike]: `%${q}%` } }
      ]
    },
    attributes: ['id', 'fistName', 'lastName', 'username']
  });

  res.json(users);
};
