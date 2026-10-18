import { Request, Response, NextFunction } from 'express';
import { isSuperAdmin } from './authenticate';
import { getSchoolSession, narrowToLevel, userSchools } from '../services/schoolSession';
import { badRequest, forbidden } from '../lib/http';
import { setRequestSchool } from '../lib/requestContext';

/**
 * Resuelve el colegio activo (header X-School-Id, o el único al que pertenece) y deja en
 * req.schoolSession los roles, permisos y alcance del usuario en ese colegio.
 * Todas las rutas /school/* (salvo /school/schools y push) pasan por acá.
 */
export const resolveSchoolSession = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const superAdmin = await isSuperAdmin(req);
    let schoolId = Number(req.headers['x-school-id']) || 0;
    if (!schoolId) {
      const schools = await userSchools(userId, superAdmin);
      if (schools.length !== 1) throw badRequest('Indicá la institución (header X-School-Id).');
      schoolId = schools[0].id;
    }
    const session = await getSchoolSession(userId, schoolId, superAdmin);
    if (!session.roles.length) throw forbidden('No pertenecés a esta institución.');
    req.schoolSession = narrowToLevel(session, Number(req.headers['x-level-id']) || null);
    setRequestSchool(schoolId);
    next();
  } catch (err) {
    next(err);
  }
};

/** Solo personal de la institución (no familias ni estudiantes). */
export const requireStaff = (req: Request, _res: Response, next: NextFunction) =>
  req.schoolSession?.isStaff ? next() : next(forbidden('Sección exclusiva del personal de la institución.'));
