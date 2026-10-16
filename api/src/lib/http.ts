import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, ZodTypeAny, z } from 'zod';
import { ValidationError, UniqueConstraintError, ForeignKeyConstraintError } from 'sequelize';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'No autenticado.') => new HttpError(401, msg);
export const forbidden = (msg = 'No tenés permisos para esta acción.') => new HttpError(403, msg);
export const notFound = (msg = 'Recurso no encontrado.') => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

/** Envuelve handlers async para que los errores lleguen al errorHandler sin try/catch repetidos. */
export const asyncHandler =
  <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as R, res, next).catch(next);
  };

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/** Valida y normaliza body/query/params. Los valores parseados reemplazan a los originales. */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) Object.defineProperty(req, 'query', { value: schemas.query.parse(req.query) });
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ message: 'Datos inválidos.', details: err.flatten().fieldErrors });
  }
  if (err instanceof UniqueConstraintError) {
    return res.status(409).json({ message: 'Ya existe un registro con esos datos.', details: err.fields });
  }
  if (err instanceof ForeignKeyConstraintError) {
    return res.status(400).json({ message: 'Referencia inválida a otro registro.' });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ message: 'Datos inválidos.', details: err.errors.map((e) => e.message) });
  }
  console.error('[unhandled]', err);
  // Nunca se devuelve el error interno al cliente.
  return res.status(500).json({ message: 'Error interno del servidor.' });
};
