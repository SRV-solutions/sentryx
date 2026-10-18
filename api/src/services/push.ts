import webpush from 'web-push';
import { Op } from 'sequelize';
import { env } from '../config/env';
import { DeviceToken } from '../models';

if (env.pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Devuelve los userIds que tienen al menos un dispositivo push registrado. */
export const usersWithPush = async (userIds: number[]) => {
  if (!userIds.length) return new Set<number>();
  const rows = await DeviceToken.findAll({ where: { userId: { [Op.in]: userIds } }, attributes: ['userId'], raw: true });
  return new Set(rows.map((r) => r.userId as number));
};

/**
 * Envía notificaciones push (PWA). Las suscripciones vencidas (404/410) se eliminan solas.
 * Los tokens EXPO quedan listos para cuando exista la app React Native.
 */
export const sendPush = async (userIds: number[], payload: PushPayload) => {
  if (!env.pushEnabled || !userIds.length) return;
  const tokens = await DeviceToken.findAll({ where: { userId: { [Op.in]: userIds }, kind: 'WEBPUSH' } });
  const body = JSON.stringify(payload);
  const expired: number[] = [];

  // Lotes de 50 envíos en paralelo: suficiente para cientos de familias sin saturar la red.
  for (let i = 0; i < tokens.length; i += 50) {
    await Promise.all(
      tokens.slice(i, i + 50).map((t) =>
        webpush
          .sendNotification({ endpoint: t.token, keys: (t.data as { keys: { p256dh: string; auth: string } }).keys }, body, {
            TTL: 60 * 60 * 24,
            urgency: 'high',
          })
          .catch((err: { statusCode?: number }) => {
            if (err.statusCode === 404 || err.statusCode === 410) expired.push(t.id);
          })
      )
    );
  }
  if (expired.length) await DeviceToken.destroy({ where: { id: expired } });
};
