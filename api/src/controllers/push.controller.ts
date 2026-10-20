/** Suscripciones de notificaciones push del dispositivo (routes/index.ts → /school/push). */
import { DeviceToken } from '../models';
import { env } from '../config/env';
import { asyncHandler, badRequest } from '../lib/http';
import { isExpoToken } from '../services/push';

// GET /school/push/public-key
export const getPublicKey = asyncHandler(async (_req, res) => {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null });
});

// POST /school/push/subscribe — navegador (WEBPUSH) o app móvil (EXPO).
export const subscribe = asyncHandler(async (req, res) => {
  const { kind, endpoint, keys, token } = req.body as { kind: 'WEBPUSH' | 'EXPO'; endpoint?: string; keys?: { p256dh: string; auth: string }; token?: string };
  if (kind !== 'WEBPUSH' && kind !== 'EXPO') throw badRequest('Suscripción inválida.');
  const deviceToken = kind === 'WEBPUSH' ? endpoint : token;
  if (!deviceToken || typeof deviceToken !== 'string' || deviceToken.length > 2048) throw badRequest('Suscripción inválida.');
  if (kind === 'EXPO' && !isExpoToken(deviceToken)) throw badRequest('Token de Expo inválido.');
  if (kind === 'WEBPUSH' && (!keys?.p256dh || !keys?.auth)) throw badRequest('Suscripción inválida.');
  const [row, created] = await DeviceToken.findOrCreate({
    where: { token: deviceToken },
    defaults: { userId: req.user!.id, kind, token: deviceToken, data: keys ? { keys } : null },
  });
  if (!created) await row.update({ userId: req.user!.id, data: keys ? { keys } : row.data, lastSeenAt: new Date() });
  res.status(201).json({ ok: true });
});

// POST /school/push/unsubscribe — { endpoint } (navegador) o { token } (app).
export const unsubscribe = asyncHandler(async (req, res) => {
  const token = (req.body.endpoint ?? req.body.token) as unknown;
  if (typeof token !== 'string' || !token) throw badRequest('Suscripción inválida.');
  await DeviceToken.destroy({ where: { token, userId: req.user!.id } });
  res.json({ ok: true });
});
