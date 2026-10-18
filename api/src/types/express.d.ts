import type { SchoolSession } from '../services/schoolSession';
import type { AuthenticatedUser } from '../middlewares/authenticate';

declare global {
  namespace Express {
    interface Request {
      /** Usuario autenticado (middlewares/authenticate.ts). */
      user?: AuthenticatedUser;
      /** Colegio activo con los roles, permisos y alcance del usuario (middlewares/schoolSession.ts). */
      schoolSession?: SchoolSession;
    }
  }
}

export {};
