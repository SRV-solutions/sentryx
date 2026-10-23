/**
 * Sesiones y dispositivos de la propia cuenta (routes/users.routes.ts):
 * ver dónde está abierta la sesión, cerrarla en otros dispositivos, y "Llevar Sentryx al celular"
 * (QR con un link de un solo uso que entra sin escribir la contraseña).
 */
import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import { User, LoginLinkToken } from '../models';
import { asyncHandler, badRequest, unauthorized } from '../lib/http';
import { currentRequest, setRequestUser } from '../lib/requestContext';
import { signToken } from '../middlewares/authenticate';
import { createSession, listSessions, revokeSession, revokeOtherSessions, SESSION_IDLE_DAYS } from '../services/sessions';
import { accountPayload } from '../services/accounts';
import { audit } from '../services/audit';
import { env } from '../config/env';

const LINK_TTL_MS = 5 * 60_000;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export const redeemLoginLinkBody = { body: z.object({ token: z.string().min(20).max(200) }) };
export const sessionParam = { params: z.object({ id: z.string().min(8).max(64) }) };

// GET /users/sessions
export const listMySessions = asyncHandler(async (req, res) => {
  res.json({ sessions: await listSessions(req.user!.id, req.user!.sid), idleDays: SESSION_IDLE_DAYS });
});

// POST /users/sessions/logout-others — cierra la sesión en todos los demás dispositivos.
export const logoutOthers = asyncHandler(async (req, res) => {
  const closed = await revokeOtherSessions(req.user!.id, req.user!.sid);
  await audit({ schoolId: null, userId: req.user!.id, entity: 'Session', action: 'logout-others', after: { closed } });
  res.json({ closed });
});

// DELETE /users/sessions/:id — cierra una sesión puntual.
export const revokeOne = asyncHandler(async (req, res) => {
  if (req.params.id === req.user!.sid) throw badRequest('Para cerrar esta sesión usá "Cerrar sesión".');
  await revokeSession(req.user!.id, req.params.id);
  res.status(204).end();
});

// POST /users/logout — cierra la sesión de este dispositivo (el cliente además borra el token).
export const logout = asyncHandler(async (req, res) => {
  if (req.user!.sid) await revokeSession(req.user!.id, req.user!.sid);
  res.status(204).end();
});

/**
 * POST /users/login-link — desde una sesión abierta (la PC) genera un link de un solo uso que vale 5
 * minutos: el celular lo escanea y entra como la misma persona, sin escribir la contraseña.
 */
export const createLoginLink = asyncHandler(async (req, res) => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  // Un solo link vivo por persona: los anteriores dejan de servir.
  await LoginLinkToken.update({ usedAt: new Date() }, { where: { userId: req.user!.id, usedAt: null } });
  await LoginLinkToken.create({ userId: req.user!.id, tokenHash: sha256(token), expiresAt, usedAt: null });
  res.json({ url: `${env.FRONTEND_URL}/login?link=${token}`, expiresAt });
});

// POST /users/login-link/redeem — público (con límite de intentos): canjea el link por una sesión nueva.
export const redeemLoginLink = asyncHandler(async (req, res) => {
  const { token } = req.body as { token: string };
  const record = await LoginLinkToken.findOne({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw unauthorized('El código ya se usó o venció. Volvé a abrir "Llevar Sentryx al celular" en la computadora y escaneá el nuevo.');
  }
  const user = await User.findByPk(record.userId);
  if (!user || !user.isActive) throw unauthorized('La cuenta ya no está activa.');
  await record.update({ usedAt: new Date() });
  setRequestUser(user.id);
  const r = currentRequest();
  const sid = await createSession(user.id, { ip: r?.ip ?? null, userAgent: r?.userAgent ?? null, appVersion: (req.headers['x-app-version'] as string) ?? null, via: 'QR' });
  await User.update({ lastLogin: new Date() }, { where: { id: user.id } });
  await audit({ schoolId: null, userId: user.id, entity: 'Session', action: 'login-qr' });
  res.json({ token: signToken(user, sid), userData: await accountPayload(user.id) });
});
