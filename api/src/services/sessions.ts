/**
 * Sesiones por dispositivo.
 *  - Cada login crea una UserSession y el token lleva su id (sid).
 *  - Una sesión vence a los SESSION_IDLE_DAYS sin uso; mientras se usa, el token se renueva solo
 *    (authenticate manda uno nuevo en el header X-Session-Token cuando el actual tiene más de un día).
 *  - Se puede cerrar una sesión puntual o "todas las demás" desde Mi perfil.
 */
import { randomBytes } from 'crypto';
import { Op } from 'sequelize';
import { UserSession } from '../models';
import { emitToUsers } from './realtime';

/** Avisa a los dispositivos abiertos de la cuenta que verifiquen su sesión: el que quedó cerrado vuelve al login al instante. */
export const notifySessionsChanged = (userId: number) => emitToUsers([userId], 'session:check', {});

export const SESSION_IDLE_DAYS = 30;
const IDLE_MS = SESSION_IDLE_DAYS * 86_400_000;
/** Cada cuánto se escribe "último uso" en la base (evita un UPDATE por request). */
const TOUCH_EVERY_MS = 10 * 60_000;
const CACHE_TTL_MS = 30_000;

interface SessionState {
  userId: number;
  lastUsedAt: number;
  revoked: boolean;
  loadedAt: number;
}
const cache = new Map<string, SessionState>();
export const invalidateSessionCache = (sid?: string) => (sid ? cache.delete(sid) : cache.clear());

/** Nombre legible del dispositivo a partir del User-Agent y la versión de la app. */
export const deviceLabel = (userAgent: string | null | undefined, appVersion?: string | null, via?: string) => {
  const ua = userAgent ?? '';
  const os = /iPhone|iPad/i.test(ua) ? 'iPhone' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  const app = appVersion ? `App Sentryx ${appVersion}` : /okhttp|Expo|ReactNative/i.test(ua) ? 'App Sentryx' : browser || 'Navegador';
  return `${via ? `${via} · ` : ''}${app}${os ? ` · ${os}` : ''}`.slice(0, 120);
};

export const createSession = async (userId: number, info: { ip: string | null; userAgent: string | null; appVersion?: string | null; via?: string }) => {
  const id = randomBytes(16).toString('hex');
  await UserSession.create({ id, userId, device: deviceLabel(info.userAgent, info.appVersion, info.via), ip: info.ip, lastUsedAt: new Date(), revokedAt: null });
  return id;
};

/** Valida que la sesión exista, no esté cerrada ni vencida por inactividad; actualiza "último uso" cada tanto. */
export const checkSession = async (sid: string, ip: string | null): Promise<'ok' | 'revoked' | 'expired' | 'missing'> => {
  let s = cache.get(sid);
  if (!s || Date.now() - s.loadedAt > CACHE_TTL_MS) {
    const row = await UserSession.findByPk(sid, { attributes: ['userId', 'lastUsedAt', 'revokedAt'] });
    if (!row) return 'missing';
    s = { userId: row.userId, lastUsedAt: row.lastUsedAt.getTime(), revoked: !!row.revokedAt, loadedAt: Date.now() };
    cache.set(sid, s);
  }
  if (s.revoked) return 'revoked';
  if (Date.now() - s.lastUsedAt > IDLE_MS) {
    await UserSession.update({ revokedAt: new Date() }, { where: { id: sid, revokedAt: null } });
    s.revoked = true;
    return 'expired';
  }
  if (Date.now() - s.lastUsedAt > TOUCH_EVERY_MS) {
    s.lastUsedAt = Date.now();
    UserSession.update({ lastUsedAt: new Date(), ...(ip ? { ip } : {}) }, { where: { id: sid } }).catch(() => {});
  }
  return 'ok';
};

export const listSessions = async (userId: number, currentSid?: string) => {
  const rows = await UserSession.findAll({ where: { userId, revokedAt: null, lastUsedAt: { [Op.gt]: new Date(Date.now() - IDLE_MS) } }, order: [['lastUsedAt', 'DESC']] });
  return rows.map((r) => ({ id: r.id, device: r.device, ip: r.ip, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, current: r.id === currentSid }));
};

export const revokeSession = async (userId: number, sid: string) => {
  const [n] = await UserSession.update({ revokedAt: new Date() }, { where: { id: sid, userId, revokedAt: null } });
  cache.delete(sid);
  if (n > 0) notifySessionsChanged(userId);
  return n > 0;
};

/** Cierra todas las sesiones de la cuenta salvo la actual (o todas, si no se indica). */
export const revokeOtherSessions = async (userId: number, keepSid?: string) => {
  const [n] = await UserSession.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null, ...(keepSid ? { id: { [Op.ne]: keepSid } } : {}) } });
  cache.clear();
  if (n > 0) notifySessionsChanged(userId);
  return n;
};

/** Limpieza (una vez por día): sesiones cerradas o vencidas hace más de 60 días. */
export const purgeOldSessions = () =>
  UserSession.destroy({ where: { [Op.or]: [{ revokedAt: { [Op.lt]: new Date(Date.now() - 60 * 86_400_000) } }, { lastUsedAt: { [Op.lt]: new Date(Date.now() - 2 * IDLE_MS) } }] } });
