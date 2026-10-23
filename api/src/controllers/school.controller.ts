/** Controlador de school: la lógica de cada ruta de routes/school.routes.ts. */
import { Level, Division, School } from '../models';
import { asyncHandler, badRequest } from '../lib/http';
import { userSchools, SchoolSession } from '../services/schoolSession';
import { roleCatalogForDisplay } from '../services/rbac';
import { isStorageConfigured } from '../services/files';
import { CATEGORY_LABELS, isStaffRole } from '../constants/school';
import { roleLabel, grantableRoleCodes } from '../services/roleRegistry';
import { env } from '../config/env';
import { audit } from '../services/audit';
import { publicSchool, resolveLogo, isImageAsset } from '../services/branding';
import { isSuperAdmin } from '../middlewares/authenticate';
import { Entity, Action } from '../constants/permissions';
import { RoleCode } from '../constants/roles';
import { planDefinition, featuresOf } from '../constants/plans';

// El alta de colegios está en la consola de la plataforma (src/platform/routes.ts).

/** ¿Participa de algún canal de curso? (Solo existen en Secundario.) */
const hasChannels = async (session: SchoolSession) => {
  if (session.self?.divisionId) return true;
  if (!session.isStaff || !session.academicYearId) return false;
  const moderatesByScope = session.can(Entity.CHANNELS, Action.MODERATE) && session.roles.some((r) => isStaffRole(r) && r !== RoleCode.DOCENTE);
  const ids = session.teaching.map((t) => t.divisionId);
  const where = moderatesByScope ? (session.scope.all ? { schoolId: session.schoolId } : { id: [...ids, ...session.scope.divisionIds] }) : { id: ids.length ? ids : [0] };
  return (await Division.count({ where: { ...where, academicYearId: session.academicYearId }, include: [{ model: Level, where: { type: 'SECUNDARIO' }, attributes: [] }] })) > 0;
};

/** Escuelas del usuario (para el selector, como en Educabot pero con roles por escuela). */
// GET /schools
export const listMySchools = asyncHandler(async (req, res) => {
    const schools = await userSchools(req.user!.id, await isSuperAdmin(req));
    res.json(await Promise.all(schools.map(publicSchool)));
  });

/** Sesión escolar: roles, permisos y alcance. El frontend arma la navegación con esto. */
// GET /session
export const getSession = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const school = await School.findByPk(session.schoolId);
    const levels = await Level.findAll({ where: { schoolId: session.schoolId, id: session.levelIds }, attributes: ['id', 'name', 'type'], order: [['id', 'ASC']] });
    res.json({
      school: { id: school!.id, name: school!.name, slug: school!.slug, logoUrl: await resolveLogo(school!) },
      levels,
      activeLevelId: session.activeLevelId,
      academicYearId: session.academicYearId,
      roles: session.roles,
      roleLabels: session.roles.map((r) => roleLabel(r)),
      permissions: [...session.permissions],
      isStaff: session.isStaff,
      isGuardian: session.isGuardian,
      scope: session.scope,
      teaching: session.teaching,
      childIds: session.childIds,
      category: session.category,
      categoryLabel: session.category ? CATEGORY_LABELS[session.category] : null,
      self: session.self,
      hasChannels: await hasChannels(session),
      /** Plan de la persona: la app muestra o bloquea (con opción de pedir el cambio) las funciones extra. */
      plan: { code: session.plan, name: planDefinition(session.plan).name, storageGb: planDefinition(session.plan).storageGb, features: [...featuresOf(session.plan)] },
      /** Funciones que dependen de la configuración del servidor (la app oculta lo que no está disponible). */
      features: { fileUploads: isStorageConfigured(), maxUploadMb: Math.max(env.FILE_MAX_MB, env.VIDEO_MAX_MB) },
      grantableRoles: session.can(Entity.USERS, Action.UPDATE) ? grantableRoleCodes(session) : [],
      canManageRoles: session.can(Entity.ROLES, Action.MANAGE),
    });
  });

/** Catálogo de roles y permisos (matriz "Roles y permisos" de Administración). */
// GET /roles
export const getRoleCatalog = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    res.json({ ...(await roleCatalogForDisplay(session.schoolId)), canManage: session.can(Entity.ROLES, Action.MANAGE) });
  });

// ----- Datos institucionales -----
// GET /settings
export const getSettings = asyncHandler(async (req, res) => {
    const school = await School.findByPk(req.schoolSession!.schoolId);
    res.json({ ...school!.toJSON(), logoUrl: await resolveLogo(school!), logoRef: school!.logoUrl });
  });

// PATCH /settings
export const updateSettings = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const school = await School.findByPk(session.schoolId);
    const { logoFileId, ...data } = req.body;
    const patch: Record<string, unknown> = { ...data };
    if (logoFileId !== undefined) {
      if (logoFileId && !(await isImageAsset(logoFileId, session.schoolId))) throw badRequest('El escudo debe ser una imagen subida a la plataforma.');
      patch.logoUrl = logoFileId ? `file:${logoFileId}` : null;
    }
    await school!.update(patch);
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'School', entityId: school!.id, action: 'update', after: patch });
    res.json(await publicSchool(school!));
  });
