import { Notification, UserNotification, User } from '../models';
import { emitToUsers } from './realtime';
import { sendPush, usersWithPush } from './push';
import { sendMail } from '../config/mailer';
import { brandEmail } from '../lib/emailTemplate';
import { env } from '../config/env';

export interface NotifyInput {
  userIds: number[];
  title: string;
  message: string;
  type: string;
  /** Ruta del frontend (ej: /comunicados/12). */
  link?: string;
  /** 'fallback': email solo a quien no tiene push. 'always': a todos. 'never'. */
  email?: 'fallback' | 'always' | 'never';
}

/**
 * Entrega multicanal: campana in-app + socket (inmediato) + push (celular) + email (respaldo).
 * Se ejecuta en segundo plano: quien llama no espera a los canales externos.
 */
export const notify = (input: NotifyInput) => {
  const userIds = [...new Set(input.userIds)];
  if (!userIds.length) return;

  void (async () => {
    try {
      const notification = await Notification.create({
        title: input.title,
        message: input.message,
        type: input.type,
        link: input.link,
      } as any);
      await UserNotification.bulkCreate(
        userIds.map((userId) => ({ userId, notificationId: notification.id, read: false, seenAt: null })) as any[]
      );

      emitToUsers(userIds, 'notification', {
        id: notification.id,
        title: input.title,
        message: input.message,
        type: input.type,
        link: input.link,
        createdAt: notification.createdAt,
        read: false,
      });

      await sendPush(userIds, { title: input.title, body: input.message, url: input.link, tag: input.type });

      const mode = input.email ?? 'fallback';
      if (mode === 'never') return;
      let mailTo = userIds;
      if (mode === 'fallback') {
        const withPush = await usersWithPush(userIds);
        mailTo = userIds.filter((id) => !withPush.has(id));
      }
      if (!mailTo.length) return;
      const users = await User.findAll({ where: { id: mailTo, isActive: true }, attributes: ['email', 'firstName'] });
      sendMail(
        users
          .filter((u) => u.email && !u.email.endsWith('@sin-email.local'))
          .map((u) => ({
            to: u.email,
            subject: input.title,
            html: brandEmail({
              title: input.title,
              paragraphs: [`Hola ${u.firstName},`, input.message],
              cta: { label: 'Ver en Sentryx', url: `${env.FRONTEND_URL}${input.link ?? ''}` },
            }),
          }))
      );
    } catch (err) {
      console.error('[notify]', err);
    }
  })();
};
