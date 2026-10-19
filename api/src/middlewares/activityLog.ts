import { Request, Response, NextFunction } from 'express';
import { ActivityLog } from '../models';
import { currentRequest } from '../lib/requestContext';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Pedidos que no aportan a la auditoría (marcar como leído, suscripciones push). */
// Las respuestas de los juegos en vivo (/play) son muchas por segundo y anónimas: no se registran.
const IGNORED_PATHS = [/\/read$/, /\/read-all$/, /^\/school\/push\//, /\/ack$/, /^\/play\//];

/**
 * Registra en ActivityLog cada pedido que modifica algo: usuario, colegio, IP, ruta, resultado y duración.
 * Se escribe al terminar la respuesta y sin esperar (no demora al usuario).
 */
export const activityLogger = (req: Request, res: Response, next: NextFunction) => {
  if (!WRITE_METHODS.has(req.method) || IGNORED_PATHS.some((re) => re.test(req.path))) return next();
  const startedAt = Date.now();
  const context = currentRequest();
  res.on('finish', () => {
    ActivityLog.create({
      userId: context?.userId ?? null,
      schoolId: context?.schoolId ?? null,
      method: req.method,
      path: req.originalUrl.split('?')[0].slice(0, 300),
      statusCode: res.statusCode,
      ip: context?.ip ?? req.ip ?? null,
      userAgent: context?.userAgent ?? null,
      durationMs: Date.now() - startedAt,
    }).catch((err) => console.error('[activity] no se pudo registrar', err.message));
  });
  next();
};
