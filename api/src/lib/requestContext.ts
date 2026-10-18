import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';

/**
 * Datos del pedido en curso (IP, navegador, usuario, colegio), disponibles en cualquier función
 * sin pasar `req` de mano en mano. Lo usa la auditoría para registrar quién hizo qué y desde dónde.
 */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  userId: number | null;
  schoolId: number | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const currentRequest = (): RequestContext | undefined => storage.getStore();

/** Middleware: abre el contexto del pedido. Va antes de las rutas. */
export const withRequestContext = (req: Request, _res: Response, next: NextFunction) => {
  storage.run(
    { ip: req.ip ?? null, userAgent: req.headers['user-agent']?.slice(0, 300) ?? null, userId: null, schoolId: null },
    next
  );
};

/** Completa el contexto a medida que se conoce (después de autenticar o de resolver el colegio). */
export const setRequestUser = (userId: number) => {
  const context = storage.getStore();
  if (context) context.userId = userId;
};
export const setRequestSchool = (schoolId: number) => {
  const context = storage.getStore();
  if (context) context.schoolId = schoolId;
};
