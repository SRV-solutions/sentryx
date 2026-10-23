import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { env } from '../config/env';
import { User } from '../models';
import { RoleCode } from '../constants/roles';
import { platformRolesOf } from '../services/rbac';
import { unauthorized } from '../lib/http';
import { setRequestUser } from '../lib/requestContext';
import { checkSession } from '../services/sessions';
import { emitToUsers } from '../services/realtime';

/**
 * AUTENTICACIÓN (¿quién sos?). Los permisos (¿qué podés hacer?) los resuelve middlewares/authorize.ts.
 *
 * El token lleva la "versión de sesión" del usuario (User.tokenVersion). Al cambiar o blanquear la
 * contraseña la versión sube y todos los tokens anteriores dejan de servir. Una cuenta desactivada
 * también queda afuera aunque tenga un token vigente.
 */

interface TokenPayload {
  id: number | string;
  email: string;
  /** Versión de sesión (tokenVersion). Tokens viejos sin versión equivalen a 0. */
  ver?: number;
  /** Id de la sesión por dispositivo (UserSession). Tokens viejos no lo traen. */
  sid?: string;
  iat?: number;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  sid?: string;
  /** Cuándo se firmó el token (segundos). */
  issuedAt?: number;
}

export const signToken = (user: { id: number; email: string; tokenVersion: number }, sid?: string) =>
  jwt.sign({ id: user.id, email: user.email, ver: user.tokenVersion, ...(sid ? { sid } : {}) } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

/** El token se renueva solo cuando tiene más de un día: la sesión dura 30 días desde el ÚLTIMO uso, no desde el login. */
const REFRESH_AFTER_S = 24 * 3600;

// Estado de la cuenta en memoria (30 s): evita consultar la base en cada request.
const ACCOUNT_CACHE_TTL_MS = 30_000;
interface AccountState {
  isActive: boolean;
  tokenVersion: number;
  platformRoles: RoleCode[];
  loadedAt: number;
}
const accountCache = new Map<number, AccountState>();

export const invalidateAccountCache = (userId?: number) => {
  if (userId === undefined) return accountCache.clear();
  accountCache.delete(userId);
  // Cambió la contraseña o el estado de la cuenta: los dispositivos abiertos verifican su sesión al instante.
  emitToUsers([userId], 'session:check', {});
};

const accountState = async (userId: number): Promise<AccountState | null> => {
  const cached = accountCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < ACCOUNT_CACHE_TTL_MS) return cached;
  const user = await User.findByPk(userId, { attributes: ['isActive', 'tokenVersion'] });
  if (!user) return null;
  const state = { isActive: user.isActive, tokenVersion: user.tokenVersion, platformRoles: await platformRolesOf(userId), loadedAt: Date.now() };
  accountCache.set(userId, state);
  return state;
};

/** Valida el token y que la cuenta siga activa y con la misma versión de sesión. */
const verifyToken = async (token: string, ip?: string | null): Promise<AuthenticatedUser> => {
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    throw unauthorized('Sesión vencida o inválida. Volvé a iniciar sesión.');
  }
  const userId = Number(payload.id);
  const state = await accountState(userId);
  if (!state || !state.isActive) throw unauthorized('La cuenta está desactivada.');
  if ((payload.ver ?? 0) !== state.tokenVersion) throw unauthorized('Tu sesión se cerró porque se cambió la contraseña. Volvé a ingresar.');
  if (payload.sid) {
    const session = await checkSession(payload.sid, ip ?? null);
    if (session === 'revoked' || session === 'missing') throw unauthorized('Esta sesión se cerró desde otro dispositivo. Volvé a ingresar.');
    if (session === 'expired') throw unauthorized('Tu sesión se cerró por inactividad (30 días sin uso). Volvé a ingresar.');
  }
  return { id: userId, email: payload.email, sid: payload.sid, issuedAt: payload.iat };
};

/** Exige un usuario autenticado (header Authorization: Bearer <token>). */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw unauthorized('No autorizado. Falta el token de sesión.');
    req.user = await verifyToken(token, req.ip);
    setRequestUser(req.user.id);
    // Renovación deslizante: el cliente guarda el token nuevo y la sesión sigue 30 días más desde hoy.
    if (req.user.sid && req.user.issuedAt && Date.now() / 1000 - req.user.issuedAt > REFRESH_AFTER_S) {
      const state = await accountState(req.user.id);
      if (state) res.setHeader('X-Session-Token', signToken({ id: req.user.id, email: req.user.email, tokenVersion: state.tokenVersion }, req.user.sid));
    }
    next();
  } catch (err) {
    next(err);
  }
};

/** ¿Es del equipo de Sentryx? (rol de plataforma SUPERADMIN). */
export const isSuperAdmin = async (req: Request) => {
  if (!req.user) return false;
  const state = await accountState(req.user.id);
  return !!state?.platformRoles.includes(RoleCode.SUPERADMIN);
};

/** Roles de plataforma del usuario autenticado (para authorize en rutas de plataforma). */
export const platformRolesOfRequest = async (req: Request): Promise<RoleCode[]> =>
  req.user ? (await accountState(req.user.id))?.platformRoles ?? [] : [];

/** Autenticación del socket de tiempo real (mismo token y mismas reglas). */
export const authenticateSocket = async (socket: Socket & { user?: AuthenticatedUser }, next: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No autorizado: falta el token.'));
  try {
    socket.user = await verifyToken(token);
    next();
  } catch (err) {
    next(err instanceof Error ? err : new Error('Token inválido o expirado.'));
  }
};
