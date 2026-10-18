import { Request, Response, NextFunction } from 'express';
import { forbidden } from '../lib/http';

/**
 * Lo ÚNICO que una cuenta de familia o de estudiante puede escribir. Todo lo demás (aulas, materias,
 * divisiones, notas, asistencia, comunicados, publicaciones, personas, configuración) queda bloqueado
 * aunque algún endpoint olvidara su chequeo de permiso.
 */
export const NON_STAFF_WRITE_ALLOWLIST: Array<{ method: string; path: RegExp; why: string }> = [
  { method: 'POST', path: /^\/threads$/, why: 'Iniciar una conversación (solo con sus contactos permitidos)' },
  { method: 'POST', path: /^\/threads\/\d+\/messages$/, why: 'Responder en una conversación propia' },
  { method: 'POST', path: /^\/threads\/\d+\/read$/, why: 'Marcar como leída' },
  { method: 'POST', path: /^\/announcements\/\d+\/ack$/, why: 'Confirmar lectura de un comunicado' },
  { method: 'POST', path: /^\/files\/presign$/, why: 'Subir un adjunto para un mensaje' },
  { method: 'POST', path: /^\/files\/\d+\/confirm$/, why: 'Confirmar la subida del adjunto' },
  { method: 'DELETE', path: /^\/files\/\d+$/, why: 'Borrar un archivo propio' },
  { method: 'POST', path: /^\/channels\/\d+\/messages$/, why: 'Escribir en el canal de su curso' },
  { method: 'POST', path: /^\/channels\/\d+\/read$/, why: 'Marcar el canal como leído' },
];

export const isAllowedForNonStaff = (method: string, path: string) =>
  NON_STAFF_WRITE_ALLOWLIST.some((r) => r.method === method.toUpperCase() && r.path.test(path));

/** Bloquea toda escritura de familias y estudiantes fuera de la lista anterior. */
export const nonStaffWriteGuard = (req: Request, _res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.schoolSession?.isStaff) return next();
  if (isAllowedForNonStaff(req.method, req.path)) return next();
  next(forbidden('Las cuentas de familias y estudiantes no pueden crear, editar ni eliminar contenido de la institución.'));
};
