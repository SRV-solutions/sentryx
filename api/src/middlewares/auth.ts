import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { env } from '../config/env';
import { Role, Permission } from '../models';
import { Action, Entity } from '../models/enums';

interface JwtPayload {
  id: number | string;
  email: string;
  roleId: number | string;
}

export const signToken = (user: { id: number; email: string; roleId: number }) =>
  jwt.sign({ id: user.id, email: user.email, roleId: user.roleId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

const decode = (token: string) => {
  const p = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  return { id: Number(p.id), email: p.email, roleId: Number(p.roleId) };
};

export const isAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ message: 'No autorizado. Token no proporcionado.' });
  try {
    req.user = decode(token);
    next();
  } catch {
    return res.status(401).json({ message: 'Sesión vencida o inválida. Volvé a iniciar sesión.' });
  }
};

export const verifyEmbeddingToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['x-embedding-token'];
  if (!env.EMBEDDING_SECRET || token !== env.EMBEDDING_SECRET) return res.status(403).json({ error: 'No autorizado' });
  next();
};

// --- Permisos globales (LMS legacy) con caché en memoria ---
// Antes se consultaba la base en cada request (a veces dos veces por ruta). Los roles cambian muy poco.
const CACHE_TTL = 5 * 60_000;
const roleCache = new Map<number, { perms: Set<string>; roleName: string; at: number }>();

export const getRolePermissions = async (roleId: number) => {
  const hit = roleCache.get(roleId);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit;
  const role = await Role.findByPk(roleId, { include: [Permission] });
  const entry = {
    perms: new Set((role?.Permissions ?? []).map((p) => `${p.entity}:${p.action}`)),
    roleName: role?.roleName ?? '',
    at: Date.now(),
  };
  roleCache.set(roleId, entry);
  return entry;
};

export const invalidateRoleCache = () => roleCache.clear();

export const checkPermission =
  (...required: Array<[Entity, Action]> | [Entity, Action]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Usuario no autenticado.' });
    const pairs = (Array.isArray(required[0]) ? required : [required]) as Array<[Entity, Action]>;
    try {
      const { perms } = await getRolePermissions(req.user.roleId);
      const missing = pairs.find(([e, a]) => !perms.has(`${e}:${a}`));
      if (missing) return res.status(403).json({ message: `No tenés permisos para ${missing[1]} en ${missing[0]}` });
      next();
    } catch (err) {
      next(err);
    }
  };

export const isSuperAdmin = async (req: Request) =>
  req.user ? (await getRolePermissions(req.user.roleId)).roleName === 'admin' : false;

export const isSocketAuth = (socket: Socket & { user?: unknown }, next: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No autorizado: Token no proporcionado.'));
  try {
    socket.user = decode(token);
    next();
  } catch {
    next(new Error('Token inválido o expirado.'));
  }
};
