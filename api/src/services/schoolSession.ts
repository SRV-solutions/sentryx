import { Op } from 'sequelize';
import { UserRole, AcademicYear, Division, TeachingAssignment, StudentGuardian, Student, Enrollment, School, Level, PlanAssignment } from '../models';
import { PlanCode, PlanFeature, DEFAULT_PLAN, featuresOf } from '../constants/plans';
import { RoleCode, SchoolRole, Category, isStaffRole, categoryOf, SCHOOL_WIDE_ROLES } from '../constants/roles';
import { Entity, Action, PermissionKey, permissionKey } from '../constants/permissions';
import { permissionsForRoles } from './rbac';
import { forbidden } from '../lib/http';

/**
 * SESIÓN ESCOLAR: lo que una persona es y puede hacer dentro de UN colegio.
 * Se arma en cada request (con caché de 60 s) a partir de sus roles en ese colegio.
 */
export interface SchoolSession {
  schoolId: number;
  userId: number;
  academicYearId: number | null;
  roles: SchoolRole[];
  /** Claves "entidad:acción" de todos sus roles. Usar session.can(Entity.X, Action.Y). */
  permissions: Set<PermissionKey>;
  can: (entity: Entity, action: Action) => boolean;
  isStaff: boolean;
  isGuardian: boolean;
  /** Alcance del personal: toda la escuela o un conjunto de divisiones del ciclo actual. */
  scope: { all: boolean; levelIds: number[]; divisionIds: number[] };
  /** Alcance real sobre toda la institución (no cambia con el selector de nivel). */
  schoolWide: boolean;
  /** Equipo de Sentryx: entra a cualquier colegio con permisos de Representante Legal. */
  superAdmin: boolean;
  /** Materias que dicta el usuario (docente). */
  teaching: Array<{ divisionId: number; subjectId: number }>;
  /** Hijos/as del usuario en esta escuela. */
  childIds: number[];
  /** Niveles a los que el personal tiene acceso (para el selector de nivel). */
  levelIds: number[];
  /** Directivo / Docente / Familia / Estudiante (la más alta si tiene varias). */
  category: Category | null;
  /** Si es una cuenta de estudiante: su legajo y división actual. */
  self: { studentId: number; divisionId: number | null } | null;
  /** Nivel elegido en el selector (header X-Level-Id). null = todos. */
  activeLevelId: number | null;
  /** divisionId → levelId del ciclo vigente (para filtrar por nivel sin consultar la base). */
  divisionLevel: Record<number, number>;
  /** Plan contratado para esta persona (el equipo de Sentryx: Integral). */
  plan: PlanCode;
  /** ¿Su plan incluye esta función? Usar junto con can(): el rol dice qué le toca, el plan qué tiene contratado. */
  hasFeature: (feature: PlanFeature) => boolean;
}

const withPermissionCheck = (permissions: Set<PermissionKey>) => (entity: Entity, action: Action) => permissions.has(permissionKey(entity, action));

// Caché corto: la sesión se arma con ~6 consultas livianas; con 60 s de TTL casi todas las requests la leen de memoria.
const SESSION_CACHE_TTL_MS = 60_000;
const sessionCache = new Map<string, { session: SchoolSession; builtAt: number }>();

/** Descarta las sesiones en caché (de un usuario o de todos) después de cambiar roles, vínculos o alcance. */
export const invalidateSchoolSession = (userId?: number) => {
  if (userId === undefined) return sessionCache.clear();
  for (const key of sessionCache.keys()) if (key.startsWith(`${userId}:`)) sessionCache.delete(key);
};

export const currentAcademicYear = async (schoolId: number) =>
  (await AcademicYear.findOne({ where: { schoolId, isCurrent: true } })) ??
  (await AcademicYear.findOne({ where: { schoolId }, order: [['year', 'DESC']] }));

const buildSchoolSession = async (userId: number, schoolId: number, superAdmin: boolean): Promise<SchoolSession> => {
  const [userRoles, academicYear, guardianLinks, planAssignment] = await Promise.all([
    UserRole.findAll({ where: { userId, schoolId, active: true } }),
    currentAcademicYear(schoolId),
    StudentGuardian.findAll({
      where: { userId },
      include: [{ model: Student, where: { schoolId, active: true }, attributes: ['id'] }],
      attributes: ['studentId'],
    }),
    PlanAssignment.findOne({ where: { schoolId, userId, endedAt: null }, attributes: ['plan'], raw: true }),
  ]);
  const plan: PlanCode = superAdmin ? 'INTEGRAL' : planAssignment?.plan ?? DEFAULT_PLAN;
  const features = featuresOf(plan);

  const roles = [...new Set(userRoles.map((userRole) => userRole.role as SchoolRole))];
  if (superAdmin && !roles.includes(RoleCode.REPRESENTANTE_LEGAL)) roles.push(RoleCode.REPRESENTANTE_LEGAL);
  const childIds = guardianLinks.map((link) => link.studentId as number);
  if (childIds.length && !roles.includes(RoleCode.TUTOR)) roles.push(RoleCode.TUTOR);

  const academicYearId = academicYear?.id ?? null;
  const hasWholeSchoolScope =
    superAdmin ||
    userRoles.some(
      (userRole) =>
        SCHOOL_WIDE_ROLES.includes(userRole.role as SchoolRole) ||
        (userRole.role !== RoleCode.DOCENTE && isStaffRole(userRole.role as SchoolRole) && !userRole.levelId && !userRole.divisionIds?.length)
    );

  const teaching = academicYearId
    ? (
        await TeachingAssignment.findAll({
          where: { teacherId: userId, schoolId },
          include: [{ model: Division, where: { academicYearId }, attributes: [] }],
          attributes: ['divisionId', 'subjectId'],
          raw: true,
        })
      ).map((assignment) => ({ divisionId: assignment.divisionId as number, subjectId: assignment.subjectId as number }))
    : [];

  // Niveles a cargo (directivos y preceptores de nivel completo).
  const assignedLevelIds = [
    ...new Set(
      userRoles
        .filter(
          (userRole) =>
            userRole.levelId &&
            userRole.role !== RoleCode.DOCENTE &&
            isStaffRole(userRole.role as SchoolRole) &&
            !(userRole.role === RoleCode.PRECEPTOR && userRole.divisionIds?.length)
        )
        .map((userRole) => userRole.levelId as number)
    ),
  ];

  let divisionIds: number[] = [];
  if (!hasWholeSchoolScope && academicYearId) {
    const fromLevels = assignedLevelIds.length
      ? (await Division.findAll({ where: { levelId: assignedLevelIds, academicYearId }, attributes: ['id'], raw: true })).map((d) => d.id)
      : [];
    const preceptorDivisions = userRoles.flatMap((userRole) => (userRole.role === RoleCode.PRECEPTOR ? userRole.divisionIds ?? [] : []));
    divisionIds = [...new Set([...fromLevels, ...preceptorDivisions, ...teaching.map((t) => t.divisionId)])];
  }

  const currentDivisions = academicYearId ? await Division.findAll({ where: { schoolId, academicYearId }, attributes: ['id', 'levelId'], raw: true }) : [];
  const divisionLevel = Object.fromEntries(currentDivisions.map((d) => [d.id, d.levelId as number]));
  // Con alcance total: todos los niveles del colegio (aunque todavía no tengan divisiones cargadas).
  const staffLevelIds = hasWholeSchoolScope
    ? (await Level.findAll({ where: { schoolId }, attributes: ['id'], order: [['id', 'ASC']], raw: true })).map((l) => l.id)
    : [...new Set([...assignedLevelIds, ...divisionIds.map((id) => divisionLevel[id]).filter(Boolean)])];

  // Cuenta de estudiante (Secundario): vinculada a su legajo.
  let self: SchoolSession['self'] = null;
  if (roles.includes(RoleCode.ESTUDIANTE)) {
    const student = await Student.findOne({ where: { userId, schoolId, active: true }, attributes: ['id'] });
    if (student) {
      const enrollment = academicYearId
        ? await Enrollment.findOne({ where: { studentId: student.id, academicYearId, status: 'ACTIVE' }, attributes: ['divisionId'], raw: true })
        : null;
      self = { studentId: student.id, divisionId: (enrollment?.divisionId as number | undefined) ?? null };
    } else {
      roles.splice(roles.indexOf(RoleCode.ESTUDIANTE), 1);
    }
  }

  const permissions = await permissionsForRoles(roles);
  // La estructura institucional solo la edita quien tiene alcance sobre toda la escuela:
  // una Rectora de Secundario no debe poder modificar Primario.
  if (!hasWholeSchoolScope) permissions.delete(permissionKey(Entity.SCHOOL, Action.UPDATE));

  return {
    schoolId,
    userId,
    academicYearId,
    roles,
    permissions,
    can: withPermissionCheck(permissions),
    isStaff: roles.some(isStaffRole),
    category: categoryOf(roles),
    self,
    isGuardian: childIds.length > 0,
    scope: { all: hasWholeSchoolScope, levelIds: assignedLevelIds, divisionIds },
    schoolWide: hasWholeSchoolScope,
    superAdmin,
    teaching,
    childIds,
    levelIds: roles.some(isStaffRole) ? staffLevelIds : [],
    activeLevelId: null,
    divisionLevel,
    plan,
    hasFeature: (feature) => features.has(feature),
  };
};

/** Sesión escolar del usuario en ese colegio (desde la caché si está fresca). */
export const getSchoolSession = async (userId: number, schoolId: number, superAdmin: boolean) => {
  const key = `${userId}:${schoolId}`;
  const cached = sessionCache.get(key);
  if (cached && Date.now() - cached.builtAt < SESSION_CACHE_TTL_MS) return cached.session;
  const session = await buildSchoolSession(userId, schoolId, superAdmin);
  sessionCache.set(key, { session, builtAt: Date.now() });
  return session;
};

/** Colegios a los que pertenece el usuario (personal, familia o estudiante). El superadmin ve todos. */
export const userSchools = async (userId: number, superAdmin = false) => {
  if (superAdmin) return School.findAll({ where: { active: true }, order: [['name', 'ASC']] });
  const [userRoles, guardianLinks] = await Promise.all([
    UserRole.findAll({ where: { userId, active: true, schoolId: { [Op.ne]: null } }, attributes: ['schoolId'], raw: true }),
    StudentGuardian.findAll({ where: { userId }, include: [{ model: Student, attributes: ['schoolId'] }] }),
  ]);
  const schoolIds = [...new Set([...userRoles.map((r) => r.schoolId as number), ...guardianLinks.map((link) => link.Student!.schoolId as number)])];
  return schoolIds.length ? School.findAll({ where: { id: schoolIds, active: true }, order: [['name', 'ASC']] }) : [];
};

/**
 * Selector de nivel: quien tiene acceso a varios niveles (ej: Representante Legal) elige uno y toda la app
 * (inicio, aulas, alumnos, asistencia, alertas, comunicados) se filtra a ese nivel. Los permisos no cambian.
 */
export const narrowToLevel = (session: SchoolSession, levelId: number | null): SchoolSession => {
  if (!levelId || !session.levelIds.includes(levelId)) return session;
  const isInLevel = (divisionId: number) => session.divisionLevel[divisionId] === levelId;
  const divisionIds = session.scope.all
    ? Object.keys(session.divisionLevel).map(Number).filter(isInLevel)
    : session.scope.divisionIds.filter(isInLevel);
  return {
    ...session,
    activeLevelId: levelId,
    scope: { all: false, levelIds: [levelId], divisionIds },
    teaching: session.teaching.filter((t) => isInLevel(t.divisionId)),
  };
};

// ---------------- Chequeos de alcance ----------------

export const canSeeDivision = (session: SchoolSession, divisionId: number) =>
  session.scope.all || session.scope.divisionIds.includes(divisionId);

export const assertDivision = (session: SchoolSession, divisionId: number) => {
  if (!canSeeDivision(session, divisionId)) throw forbidden('Esa división está fuera de tu alcance.');
};

/** ¿El docente dicta esa materia en esa división? */
export const teaches = (session: SchoolSession, divisionId: number, subjectId: number) =>
  session.teaching.some((t) => t.divisionId === divisionId && t.subjectId === subjectId);

/** División actual del alumno (ciclo vigente). */
export const studentDivisionId = async (session: SchoolSession, studentId: number) => {
  if (!session.academicYearId) return null;
  const enrollment = await Enrollment.findOne({
    where: { studentId, academicYearId: session.academicYearId, status: 'ACTIVE' },
    attributes: ['divisionId'],
    raw: true,
  });
  return (enrollment?.divisionId as number | undefined) ?? null;
};

/** Personal con alcance sobre la división del alumno, su familia o el propio estudiante. */
export const assertStudentAccess = async (session: SchoolSession, studentId: number) => {
  // Familia o el propio estudiante: ven lo mismo (solo lo publicado, sin notas internas).
  if (session.childIds.includes(studentId) || session.self?.studentId === studentId) return { asGuardian: true as const };
  if (session.isStaff) {
    const student = await Student.findOne({ where: { id: studentId, schoolId: session.schoolId }, attributes: ['id'] });
    if (student) {
      if (session.scope.all) return { asGuardian: false as const };
      const divisionId = await studentDivisionId(session, studentId);
      if (divisionId && session.scope.divisionIds.includes(divisionId)) return { asGuardian: false as const };
    }
  }
  throw forbidden('No tenés acceso a este alumno.');
};

/** Filtro Sequelize de divisiones visibles. */
export const divisionWhere = (session: SchoolSession) =>
  session.scope.all ? { schoolId: session.schoolId } : { schoolId: session.schoolId, id: { [Op.in]: session.scope.divisionIds } };
