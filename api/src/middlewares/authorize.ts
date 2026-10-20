import { Request, Response, NextFunction } from 'express';
import { Entity, Action, PERMISSION_CATALOG, permissionKey } from '../constants/permissions';
import { Category, CATEGORY_LABELS } from '../constants/roles';
import { roleCategory } from '../services/roleRegistry';
import { platformRolesOfRequest } from './authenticate';
import { permissionsForRoles } from '../services/rbac';
import { forbidden } from '../lib/http';

/**
 * AUTORIZACIÓN: "para pasar por esta ruta, como mínimo hay que tener este permiso".
 *
 *   router.patch('/people/:id', authorize(Entity.USERS, Action.UPDATE), PeopleController.update)
 *
 * - Dentro de un colegio (/school/*) usa los permisos de los roles de la persona en ESE colegio.
 * - En la plataforma (/platform/*) usa sus roles de plataforma (SUPERADMIN).
 * El alcance fino (qué divisiones, qué alumnos) lo sigue chequeando cada controlador.
 */
const describe = (entity: Entity, action: Action) =>
  PERMISSION_CATALOG.find((p) => p.entity === entity && p.action === action)?.description ?? `${action} ${entity}`;

export const authorize = (entity: Entity, action: Action) => {
  const middleware = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const allowed = req.schoolSession
        ? req.schoolSession.can(entity, action)
        : (await permissionsForRoles(await platformRolesOfRequest(req))).has(permissionKey(entity, action));
      if (allowed) return next();
      next(forbidden(`No tenés permiso para: ${describe(entity, action).toLowerCase()}.`));
    } catch (err) {
      next(err);
    }
  };
  // El nombre identifica el permiso exigido (lo usan los logs y la auditoría de permisos).
  Object.defineProperty(middleware, 'name', { value: `authorize(${permissionKey(entity, action)})` });
  return middleware;
};

/** Exige alguna de esas categorías (Directivo / Docente / Familia / Estudiante) en el colegio activo. */
export const requireCategory =
  (...categories: Category[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const own = new Set(req.schoolSession?.roles.map((role) => roleCategory(role)) ?? []);
    if (categories.some((category) => own.has(category))) return next();
    next(forbidden(`Sección exclusiva de: ${categories.map((c) => CATEGORY_LABELS[c]).join(', ')}.`));
  };
