import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import helmet from 'helmet';
import cors from 'cors';
import { env } from '../config/env';

/**
 * QUIÉN PUEDE HABLAR CON LA API
 *
 * Capas, de afuera hacia adentro:
 *  1. Red: en producción la API escucha solo en 127.0.0.1 (HOST) y se llega únicamente por Caddy (HTTPS).
 *  2. Cliente de confianza (este archivo): cada pedido tiene que venir
 *     - del front (header Origin dentro de CORS_ORIGINS; lo pone el navegador y una página no lo puede falsificar), o
 *     - de un cliente registrado (header X-Client-Key de CLIENT_APP_KEYS: futura app móvil o scripts de soporte).
 *     Un curl o un script cualquiera sin esas credenciales recibe 403 aunque tenga un token robado.
 *  3. Sesión (authenticate) y permisos (authorize) en cada ruta.
 *
 * Nota honesta: el Origin lo controla el navegador, no un atacante con herramientas propias; esta capa frena
 * el uso casual o automatizado de la API, pero la seguridad real son las capas 1 y 3.
 */

/** Rutas que se pueden pedir sin Origin (las usa el navegador como <img> o los monitores de salud). */
const OPEN_PATHS = [/^\/health$/, /^\/avatars\/[a-f0-9]{32}$/];

const safeEqual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const isTrustedOrigin = (origin?: string) => !!origin && env.corsOrigins.includes(origin);
export const isTrustedClientKey = (key?: string | string[]) =>
  typeof key === 'string' && env.clientAppKeys.some((valid) => safeEqual(valid, key));

export const requireTrustedClient = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS' || OPEN_PATHS.some((re) => re.test(req.path))) return next();
  if (isTrustedOrigin(req.headers.origin) || isTrustedClientKey(req.headers['x-client-key'])) return next();
  res.status(403).json({ message: 'Acceso permitido solo desde la aplicación de Sentryx.' });
};

/** CORS: solo los orígenes del front. */
export const corsPolicy = cors({
  origin: (origin, callback) => callback(null, !origin || env.corsOrigins.includes(origin)),
  credentials: true,
  // X-Player-Token: jugadores de partidas en vivo (/play), sin cuenta.
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-School-Id', 'X-Level-Id', 'X-Client-Key', 'X-Player-Token'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
});

/** Headers de seguridad. La API solo devuelve JSON e imágenes: se bloquea todo lo demás. */
export const securityHeaders = helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // las fotos de perfil se muestran desde el front
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
});
