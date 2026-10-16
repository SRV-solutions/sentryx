import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import {
  Membership,
  AcademicYear,
  Division,
  TeachingAssignment,
  StudentGuardian,
  Student,
  Enrollment,
  School,
} from '../models';
import { SchoolRole } from './constants';
import { Permission, permissionsFor, SCHOOL_WIDE_ROLES, ROLE_PERMISSIONS } from './rbac';
import { forbidden, badRequest } from '../lib/http';
import { isSuperAdmin } from '../middlewares/auth';

export interface SchoolContext {
  schoolId: number;
  userId: number;
  academicYearId: number | null;
  roles: SchoolRole[];
  permissions: Set<Permission>;
  isStaff: boolean;
  isGuardian: boolean;
  /** Alcance del personal: toda la escuela o un conjunto de divisiones del ciclo actual. */
  scope: { all: boolean; levelIds: number[]; divisionIds: number[] };
  /** Materias que dicta el usuario (docente). */
  teaching: Array<{ divisionId: number; subjectId: number }>;
  /** Hijos/as del usuario en esta escuela. */
  childIds: number[];
  /** Niveles a los que el personal tiene acceso (para el selector de nivel). */
  levelIds: number[];
  /** Nivel elegido en el selector (header X-Level-Id). null = todos. */
  activeLevelId: number | null;
  /** divisionId → levelId del ciclo vigente (para filtrar por nivel sin consultar la base). */
  divisionLevel: Record<number, number>;
}

// Caché corto: el contexto se arma con ~5 consultas livianas; con 60 s de TTL casi todas las requests lo leen de memoria.
const TTL = 60_000;
const cache = new Map<string, { ctx: SchoolContext; at: number }>();

export const invalidateSchoolContext = (userId?: number) => {
  if (userId === undefined) return cache.clear();
  for (const key of cache.keys()) if (key.startsWith(`${userId}:`)) cache.delete(key);
};

export const currentAcademicYear = async (schoolId: number) =>
  (await AcademicYear.findOne({ where: { schoolId, isCurrent: true } })) ??
  (await AcademicYear.findOne({ where: { schoolId }, order: [['year', 'DESC']] }));

const buildContext = async (userId: number, schoolId: number, superAdmin: boolean): Promise<SchoolContext> => {
  const [memberships, year, guardianLinks] = await Promise.all([
    Membership.findAll({ where: { userId, schoolId, active: true } }),
    currentAcademicYear(schoolId),
    StudentGuardian.findAll({
      where: { userId },
      include: [{ model: Student, where: { schoolId, active: true }, attributes: ['id'] }],
      attributes: ['studentId'],
    }),
  ]);

  const roles = [...new Set(memberships.map((m) => m.role))];
  if (superAdmin && !roles.includes('REPRESENTANTE_LEGAL')) roles.push('REPRESENTANTE_LEGAL');
  const childIds = guardianLinks.map((g) => g.studentId as number);
  if (childIds.length && !roles.includes('TUTOR')) roles.push('TUTOR');

  const yearId = year?.id ?? null;
  const all =
    superAdmin ||
    memberships.some((m) => SCHOOL_WIDE_ROLES.includes(m.role) || (m.role !== 'DOCENTE' && m.role !== 'TUTOR' && !m.levelId && !m.divisionIds?.length));

  const teaching = yearId
    ? (
        await TeachingAssignment.findAll({
          where: { teacherId: userId, schoolId },
          include: [{ model: Division, where: { academicYearId: yearId }, attributes: [] }],
          attributes: ['divisionId', 'subjectId'],
          raw: true,
        })
      ).map((t) => ({ divisionId: t.divisionId as number, subjectId: t.subjectId as number }))
    : [];

  const levelIds = [
    ...new Set(
      memberships
        .filter((m) => m.levelId && m.role !== 'DOCENTE' && m.role !== 'TUTOR' && !(m.role === 'PRECEPTOR' && m.divisionIds?.length))
        .map((m) => m.levelId as number)
    ),
  ];

  let divisionIds: number[] = [];
  if (!all && yearId) {
    const fromLevels = levelIds.length
      ? (await Division.findAll({ where: { levelId: levelIds, academicYearId: yearId }, attributes: ['id'], raw: true })).map((d) => d.id)
      : [];
    const explicit = memberships.flatMap((m) => (m.role === 'PRECEPTOR' ? m.divisionIds ?? [] : []));
    divisionIds = [...new Set([...fromLevels, ...explicit, ...teaching.map((t) => t.divisionId)])];
  }

  // Mapa división → nivel del ciclo vigente (una consulta liviana, queda en caché con el contexto).
  const allDivisions = yearId ? await Division.findAll({ where: { schoolId, academicYearId: yearId }, attributes: ['id', 'levelId'], raw: true }) : [];
  const divisionLevel = Object.fromEntries(allDivisions.map((d) => [d.id, d.levelId as number]));
  const staffLevelIds = all
    ? [...new Set(allDivisions.map((d) => d.levelId as number))]
    : [...new Set([...levelIds, ...divisionIds.map((id) => divisionLevel[id]).filter(Boolean)])];

  const permissions = permissionsFor(roles);
  // La estructura institucional (niveles, divisiones, materias) solo la edita quien tiene alcance sobre toda la escuela:
  // una Rectora de Secundario no debe poder modificar Primario.
  if (!all) permissions.delete('school.manage');
  // Un docente que también es preceptor/directivo conserva grades.write para sus materias.
  if (superAdmin) ROLE_PERMISSIONS.REPRESENTANTE_LEGAL.forEach((p) => permissions.add(p));

  return {
    schoolId,
    userId,
    academicYearId: yearId,
    roles,
    permissions,
    isStaff: roles.some((r) => r !== 'TUTOR'),
    isGuardian: childIds.length > 0,
    scope: { all, levelIds, divisionIds },
    teaching,
    childIds,
    levelIds: roles.some((r) => r !== 'TUTOR') ? staffLevelIds : [],
    activeLevelId: null,
    divisionLevel,
  };
};

/** Escuelas a las que pertenece el usuario (personal o familia). */
export const userSchools = async (userId: number, superAdmin = false) => {
  if (superAdmin) return School.findAll({ where: { active: true }, order: [['name', 'ASC']] });
  const [m, g] = await Promise.all([
    Membership.findAll({ where: { userId, active: true }, attributes: ['schoolId'], raw: true }),
    StudentGuardian.findAll({ where: { userId }, include: [{ model: Student, attributes: ['schoolId'] }] }),
  ]);
  const ids = [...new Set([...m.map((x) => x.schoolId as number), ...g.map((x) => x.Student!.schoolId as number)])];
  return ids.length ? School.findAll({ where: { id: ids, active: true }, order: [['name', 'ASC']] }) : [];
};

/**
 * Resuelve la escuela activa (header X-School-Id o la única a la que pertenece) y arma el contexto
 * de permisos + alcance. Todo endpoint escolar pasa por acá.
 */
export const schoolContext = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const superAdmin = await isSuperAdmin(req);
    let schoolId = Number(req.headers['x-school-id']) || 0;
    if (!schoolId) {
      const schools = await userSchools(userId, superAdmin);
      if (schools.length !== 1) throw badRequest('Indicá la institución (header X-School-Id).');
      schoolId = schools[0].id;
    }
    const key = `${userId}:${schoolId}`;
    const hit = cache.get(key);
    let ctx = hit && Date.now() - hit.at < TTL ? hit.ctx : null;
    if (!ctx) {
      ctx = await buildContext(userId, schoolId, superAdmin);
      cache.set(key, { ctx, at: Date.now() });
    }
    if (!ctx.roles.length) throw forbidden('No pertenecés a esta institución.');
    req.school = narrowToLevel(ctx, Number(req.headers['x-level-id']) || null);
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Selector de nivel: quien tiene acceso a varios niveles (ej: Representante Legal) elige uno y toda la app
 * (inicio, aulas, alumnos, asistencia, alertas, comunicados) se filtra a ese nivel. Los permisos no cambian.
 */
const narrowToLevel = (ctx: SchoolContext, levelId: number | null): SchoolContext => {
  if (!levelId || !ctx.levelIds.includes(levelId)) return ctx;
  const inLevel = (divisionId: number) => ctx.divisionLevel[divisionId] === levelId;
  const divisionIds = ctx.scope.all
    ? Object.keys(ctx.divisionLevel).map(Number).filter(inLevel)
    : ctx.scope.divisionIds.filter(inLevel);
  return {
    ...ctx,
    activeLevelId: levelId,
    scope: { all: false, levelIds: [levelId], divisionIds },
    teaching: ctx.teaching.filter((t) => inLevel(t.divisionId)),
  };
};

export const requirePerm =
  (...perms: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const ctx = req.school!;
    if (perms.every((p) => ctx.permissions.has(p))) return next();
    next(forbidden());
  };

export const requireStaff = (req: Request, _res: Response, next: NextFunction) =>
  req.school?.isStaff ? next() : next(forbidden('Sección exclusiva del personal de la institución.'));

// --- Chequeos de alcance ---

export const canSeeDivision = (ctx: SchoolContext, divisionId: number) =>
  ctx.scope.all || ctx.scope.divisionIds.includes(divisionId);

export const assertDivision = (ctx: SchoolContext, divisionId: number) => {
  if (!canSeeDivision(ctx, divisionId)) throw forbidden('Esa división está fuera de tu alcance.');
};

/** ¿El docente dicta esa materia en esa división? */
export const teaches = (ctx: SchoolContext, divisionId: number, subjectId: number) =>
  ctx.teaching.some((t) => t.divisionId === divisionId && t.subjectId === subjectId);

/** División actual del alumno (ciclo vigente). */
export const studentDivisionId = async (ctx: SchoolContext, studentId: number) => {
  if (!ctx.academicYearId) return null;
  const e = await Enrollment.findOne({
    where: { studentId, academicYearId: ctx.academicYearId, status: 'ACTIVE' },
    attributes: ['divisionId'],
    raw: true,
  });
  return (e?.divisionId as number | undefined) ?? null;
};

/** Personal con alcance sobre la división del alumno, o familia del alumno. */
export const assertStudentAccess = async (ctx: SchoolContext, studentId: number) => {
  if (ctx.childIds.includes(studentId)) return { asGuardian: true as const };
  if (ctx.isStaff) {
    const student = await Student.findOne({ where: { id: studentId, schoolId: ctx.schoolId }, attributes: ['id'] });
    if (student) {
      if (ctx.scope.all) return { asGuardian: false as const };
      const div = await studentDivisionId(ctx, studentId);
      if (div && ctx.scope.divisionIds.includes(div)) return { asGuardian: false as const };
    }
  }
  throw forbidden('No tenés acceso a este alumno.');
};

/** Filtro Sequelize de divisiones visibles. */
export const divisionWhere = (ctx: SchoolContext) =>
  ctx.scope.all ? { schoolId: ctx.schoolId } : { schoolId: ctx.schoolId, id: { [Op.in]: ctx.scope.divisionIds } };
