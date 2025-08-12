import Notification from '../models/Notification';
import UserNotification from '../models/UserNotification';
import User from '../models/User';
import { transporter } from '../config/mailer';

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
    res.status(500).json({ message: 'Error al enviar notificación', error });
  }
};

export const sendNotificationToAll = async (req: any, res: any) => {
  try {
    const io = req.app.get('io');
    const { title, message, type, link } = req.body;

    if (!title || !message || !type) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    // Buscar todos los usuarios con email válido
    const users = await User.findAll({
      attributes: ['id', 'email', 'username', 'firstName', 'lastName'],
    });

    if (users.length === 0) {
      return res.status(404).json({ message: 'No hay usuarios disponibles' });
    }

    // Crear notificación base
    const notification = await Notification.create({ title, message, type, link });

    // Crear relaciones con todos los usuarios
    const userNotifications = users.map((user) => ({
      userId: user.id,
      notificationId: notification.id,
      read: false,
      seenAt: null,
    }));

    await UserNotification.bulkCreate(userNotifications);

    // Plantilla HTML del correo
    const htmlEmail = `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; font-family: Arial, sans-serif;">
    <tr>
      <td align="center" style="padding: 30px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; border-radius: 10px; box-shadow: 0 0 20px rgba(0, 255, 247, 0.1); color: #FFFFFF;">
          <tr>
            <td style="padding: 40px; text-align: center;">
              <h2 style="color: #00FFF7; margin-bottom: 10px;">¡Hola tenés una nueva notificación en Sentryx!</h2>
              
              <p style="font-size: 16px; color: #CCCCCC; margin-top: 30px;">
                Podés acceder a la plataforma en:<br>
                <a href="https://sentryx.wearesrv.com" style="color: #00FFF7; text-decoration: none;">https://sentryx.wearesrv.com</a>
              </p>
              <h2 style="color: #00FFF7;">${title}</h2>
              <p>${message}</p>
              ${link ? `<p><a href="${link}" style="color: #00FFF7;">Ver más</a></p>` : ''}
              <br/>
              <p style="color: #CCCCCC; margin-top: 40px;">Saludos,<br><b style="color: #00FFF7;">Equipo weareSRV</b></p>
            </td>
          </tr>
        </table>
        <img src="https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/logotipo.png" alt="weareSRV Logo" width="150" style="margin-bottom: 20px;" />
      </td>
    </tr>
  </table>
`;

    // Enviar correo a cada usuario
    for (const user of users) {
      console.log("Email Enviado a ", user.email);

      if (user.email) {
        await transporter.sendMail({
          from: `"SRV" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: `📢 Nueva notificación: ${title}`,
          html: htmlEmail,
        });
      }
    }

    // Emitir notificación por socket
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
      console.log("Notificacion Enviado a ", user.id);
      io.to(`user_${user.id}`).emit('notification', payload);
    });
    console.log("############################   Fin de la ejecucion   #######################");

    res.status(201).json({ message: 'Notificación enviada a todos los usuarios', notification: payload });

  } catch (error) {
    console.error('[sendNotificationToAll]', error);
    res.status(500).json({ message: 'Error al enviar notificación', error });
  }
};

export const sendNotificationToSomeUsers = async (req: any, res: any) => {
  try {
    const io = req.app.get('io');
    const { userIds, title, message, type, link } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0 || !title || !message || !type) {
      return res.status(400).json({ message: 'Faltan campos obligatorios o userIds inválidos' });
    }

    // Validar usuarios existentes y obtener sus correos
    const users = await User.findAll({
      where: { id: userIds },
      attributes: ['id', 'email', 'username', 'firstName', 'lastName'],
    });

    if (users.length === 0) {
      return res.status(404).json({ message: 'Ningún usuario válido encontrado' });
    }

    const validUserIds = users.map(u => u.id);

    // Crear la notificación
    const notification = await Notification.create({ title, message, type, link });

    // Crear relaciones con usuarios
    const userNotifications = validUserIds.map(userId => ({
      userId,
      notificationId: notification.id,
      read: false,
      seenAt: null
    }));
    await UserNotification.bulkCreate(userNotifications);

    // Plantilla HTML del correo

    const htmlEmail = `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; font-family: Arial, sans-serif;">
    <tr>
      <td align="center" style="padding: 30px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; border-radius: 10px; box-shadow: 0 0 20px rgba(0, 255, 247, 0.1); color: #FFFFFF;">
          <tr>
            <td style="padding: 40px; text-align: center;">
              <h2 style="color: #00FFF7; margin-bottom: 10px;">¡Hola tenes una nueva notificacion en Sentryx!</h2>
              
              <p style="font-size: 16px; color: #CCCCCC; margin-top: 30px;">
                Podés acceder a la plataforma en:<br>
                <a href="https://sentryx.wearesrv.com" style="color: #00FFF7; text-decoration: none;">https://sentryx.wearesrv.com</a>
              </p>
 <h2 style="color: #00FFF7;">${title}</h2>
      <p>${message}</p>
      ${link ? `<p><a href="${link}" style="color: #00FFF7;">Ver más</a></p>` : ''}
      <br/>
              <p style="color: #CCCCCC; margin-top: 40px;">Saludos,<br><b style="color: #00FFF7;">Equipo weareSRV</b></p>
            </td>
          </tr>
        </table>
        <img src="https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/logotipo.png" alt="weareSRV Logo" width="150" style="margin-bottom: 20px;" />
      </td>
    </tr>
  </table>
`;

    // Enviar correos a cada usuario
    for (const user of users) {
      if (user.email) {
        await transporter.sendMail({
          from: `"SRV" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: `📢 Nueva notificación: ${title}`,
          html: htmlEmail,
        });
      }
    }

    // Emitir por WebSocket
    const payload = {
      id: notification.id,
      title,
      message,
      type,
      link,
      createdAt: notification.createdAt,
      read: false,
    };

    validUserIds.forEach(userId => {
      io.to(`user_${userId}`).emit('notification', payload);
    });

    return res.status(201).json({ message: 'Notificación enviada a usuarios seleccionados', notification: payload });

  } catch (error) {
    console.error('[sendNotificationToSomeUsers]', error);
    res.status(500).json({ message: 'Error al enviar notificación', error });
  }
};