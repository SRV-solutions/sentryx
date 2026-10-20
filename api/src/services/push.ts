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

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
export const isExpoToken = (token: string) => EXPO_TOKEN_RE.test(token);

/** Devuelve los userIds que tienen al menos un dispositivo push registrado. */
export const usersWithPush = async (userIds: number[]) => {
  if (!userIds.length) return new Set<number>();
  const kinds = env.pushEnabled ? ['WEBPUSH', 'EXPO'] : ['EXPO'];
  const rows = await DeviceToken.findAll({ where: { userId: { [Op.in]: userIds }, kind: { [Op.in]: kinds } }, attributes: ['userId'], raw: true });
  return new Set(rows.map((r) => r.userId as number));
};

/** Push del navegador (PWA). Las suscripciones vencidas (404/410) se eliminan solas. */
const sendWebPush = async (tokens: DeviceToken[], payload: PushPayload) => {
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
  return expired;
};

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Push de la app (Expo). Un solo POST por cada 100 tokens (límite de Expo); los dispositivos que
 * desinstalaron la app (DeviceNotRegistered) se eliminan solos. No necesita VAPID.
 */
const sendExpoPush = async (tokens: DeviceToken[], payload: PushPayload) => {
  const expired: number[] = [];
  const valid = tokens.filter((t) => isExpoToken(t.token));
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const messages = chunk.map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      data: { url: payload.url ?? null, tag: payload.tag ?? null },
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      ...(payload.tag ? { collapseId: payload.tag } : {}),
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.warn(`[push] Expo respondió ${res.status}`);
        continue;
      }
      const { data } = (await res.json()) as { data?: ExpoTicket[] };
      data?.forEach((ticket, idx) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') expired.push(chunk[idx].id);
      });
    } catch (err) {
      console.warn('[push] Expo no disponible:', (err as Error).message);
    }
  }
  return expired;
};

/** Envía la notificación a todos los dispositivos (navegador y app) de esos usuarios. */
export const sendPush = async (userIds: number[], payload: PushPayload) => {
  if (!userIds.length) return;
  const tokens = await DeviceToken.findAll({ where: { userId: { [Op.in]: userIds } } });
  const web = env.pushEnabled ? tokens.filter((t) => t.kind === 'WEBPUSH') : [];
  const expo = tokens.filter((t) => t.kind === 'EXPO');
  if (!web.length && !expo.length) return;
  const [expiredWeb, expiredExpo] = await Promise.all([web.length ? sendWebPush(web, payload) : [], expo.length ? sendExpoPush(expo, payload) : []]);
  const expired = [...expiredWeb, ...expiredExpo];
  if (expired.length) await DeviceToken.destroy({ where: { id: expired } });
};
