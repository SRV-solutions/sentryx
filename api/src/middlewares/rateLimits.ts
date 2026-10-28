import { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * LÍMITES DE PEDIDOS
 *
 * Un colegio sale a internet con UNA sola IP: si el límite fuera solo por IP, 40 docentes entrando a las
 * 8 de la mañana se bloquearían entre sí. Por eso:
 *  - con sesión: el límite es por USUARIO (cada uno tiene su propio cupo);
 *  - en el login: por IP + cuenta intentada, y solo cuentan los intentos FALLIDOS;
 *  - por IP queda un tope alto, solo contra abusos masivos.
 *
 * Los contadores viven en memoria (alcanza con una instancia de la API). Si algún día hay varias
 * instancias detrás de un balanceador, se cambia el `store` por Redis sin tocar las rutas.
 */

const MINUTE = 60_000;
const tooMany = (message: string) => ({ message });
const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? 'desconocida');
const normalizedIdentifier = (req: Request) => String(req.body?.email ?? '').trim().toLowerCase().slice(0, 120);

const common = { standardHeaders: 'draft-7' as const, legacyHeaders: false };

/** Tope general por IP para todo el tráfico (anti-abuso; holgado para un colegio entero detrás de una IP). */
export const ipLimiter = rateLimit({
  ...common,
  windowMs: MINUTE,
  limit: 3000,
  // /play tiene su propio límite por jugador: toda un aula juega desde la misma IP (ver playLimiter).
  skip: (req) => req.path === '/health' || req.path.startsWith('/play/'),
  message: tooMany('Demasiados pedidos desde tu red. Esperá un minuto.'),
});

/** Usuarios con sesión: cupo propio por persona (la app normal hace muchos menos pedidos). */
export const userLimiter = rateLimit({
  ...common,
  windowMs: MINUTE,
  limit: 300,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : clientIp(req)),
  message: tooMany('Estás haciendo demasiados pedidos. Esperá un momento.'),
});

/** Login: 10 intentos FALLIDOS por cuenta (desde una misma IP) cada 15 minutos + 100 fallidos por IP. */
export const loginLimiter = [
  rateLimit({
    ...common,
    windowMs: 15 * MINUTE,
    limit: 100,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `login-ip:${clientIp(req)}`,
    message: tooMany('Demasiados intentos fallidos desde tu red. Probá de nuevo en unos minutos.'),
  }),
  rateLimit({
    ...common,
    windowMs: 15 * MINUTE,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `login:${clientIp(req)}:${normalizedIdentifier(req)}`,
    message: tooMany('Demasiados intentos fallidos con esa cuenta. Probá de nuevo en 15 minutos o recuperá tu contraseña.'),
  }),
];

/** Recupero de contraseña: evita usarlo para mandar emails en masa. */
export const passwordResetLimiter = rateLimit({
  ...common,
  windowMs: 60 * MINUTE,
  limit: 5,
  keyGenerator: (req) => `reset:${clientIp(req)}:${normalizedIdentifier(req) || String(req.body?.token ?? '').slice(0, 16)}`,
  message: tooMany('Ya pediste varias veces. Revisá tu email o probá de nuevo en una hora.'),
});

/**
 * Cambio del email de un estudiante (PUT /students/:id/email): lo usan familias y estudiantes y responde 409 si el
 * email ya existe, así que sin tope serviría para probar direcciones en masa. Un uso real son 1 o 2 intentos.
 */
export const studentEmailLimiter = rateLimit({
  ...common,
  windowMs: 15 * MINUTE,
  limit: 10,
  keyGenerator: (req) => `student-email:${req.user?.id ?? clientIp(req)}`,
  message: tooMany('Probaste muchos emails seguidos. Esperá unos minutos y volvé a intentar.'),
});

/** Mensajes y publicaciones: frena spam en chats y canales. */
export const messageLimiter = rateLimit({
  ...common,
  windowMs: MINUTE,
  limit: 30,
  keyGenerator: (req) => `msg:${req.user?.id ?? clientIp(req)}`,
  message: tooMany('Estás enviando mensajes muy rápido. Esperá un momento.'),
});

/** Subidas de archivos (URLs firmadas). */
export const uploadLimiter = rateLimit({
  ...common,
  windowMs: 10 * MINUTE,
  limit: 60,
  keyGenerator: (req) => `upload:${req.user?.id ?? clientIp(req)}`,
  message: tooMany('Demasiadas subidas seguidas. Esperá unos minutos.'),
});

/**
 * Juegos en vivo: cada celular consulta el estado ~1 vez por segundo. Límite por jugador (token) y,
 * para entrar a una partida, por IP (frena que alguien pruebe PINs al azar).
 */
export const playLimiter = rateLimit({
  ...common,
  windowMs: MINUTE,
  limit: 240,
  keyGenerator: (req) => `play:${String(req.headers['x-player-token'] ?? '').slice(0, 64) || clientIp(req)}`,
  message: tooMany('Demasiados pedidos. Esperá un momento.'),
});

/** Tope por IP para /play: alcanza para un aula de 60 celulares consultando cada segundo. */
export const playIpLimiter = rateLimit({
  ...common,
  windowMs: MINUTE,
  limit: 6000,
  keyGenerator: (req) => `play-ip:${clientIp(req)}`,
  message: tooMany('Demasiados pedidos desde tu red. Esperá un minuto.'),
});

export const joinGameLimiter = rateLimit({
  ...common,
  windowMs: MINUTE,
  limit: 60,
  keyGenerator: (req) => `join:${clientIp(req)}`,
  message: tooMany('Demasiados intentos de entrar a una partida. Esperá un minuto.'),
});
