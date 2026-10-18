/** Suscripciones de notificaciones push del dispositivo (routes/index.ts → /school/push). */
import { DeviceToken } from '../models';
import { env } from '../config/env';
import { asyncHandler, badRequest } from '../lib/http';

// GET /school/push/public-key
export const getPublicKey = asyncHandler(async (_req, res) => {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null });
});

// POST /school/push/subscribe — navegador (WEBPUSH) o futura app móvil (EXPO).
export const subscribe = asyncHandler(async (req, res) => {
  const { kind, endpoint, keys, token } = req.body as { kind: 'WEBPUSH' | 'EXPO'; endpoint?: string; keys?: { p256dh: string; auth: string }; token?: string };
  const deviceToken = kind === 'WEBPUSH' ? endpoint : token;
  if (!deviceToken) throw badRequest('Suscripción inválida.');
  const [row, created] = await DeviceToken.findOrCreate({
    where: { token: deviceToken },
    defaults: { userId: req.user!.id, kind, token: deviceToken, data: keys ? { keys } : null },
  });
  if (!created) await row.update({ userId: req.user!.id, data: keys ? { keys } : row.data, lastSeenAt: new Date() });
  res.status(201).json({ ok: true });
});

// POST /school/push/unsubscribe
export const unsubscribe = asyncHandler(async (req, res) => {
  await DeviceToken.destroy({ where: { token: req.body.endpoint, userId: req.user!.id } });
  res.json({ ok: true });
});
