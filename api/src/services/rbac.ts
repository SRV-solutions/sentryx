import { Op } from 'sequelize';
import { Role, Permission, RolePermission, UserRole } from '../models';
import { ROLE_CATALOG, RoleCode, RoleScope } from '../constants/roles';
import { PERMISSION_CATALOG, PermissionKey, permissionKey } from '../constants/permissions';
import { invalidateRoleRegistry } from './roleRegistry';

/**
 * ROLES Y PERMISOS EN LA BASE
 *
 * - Role, Permission y RolePermission son la fuente de verdad en ejecución.
 * - syncRbacCatalog() (al arrancar) crea los roles y permisos que falten según constants/, con sus
 *   vínculos por defecto. Si alguien ajusta los vínculos en la base, se respetan.
 * - Los permisos de cada rol se guardan en memoria (se recargan cada 5 minutos o al invalidar),
 *   así chequear un permiso en cada request no consulta la base.
 */

const CACHE_TTL_MS = 5 * 60_000;
let permissionsByRole: Map<RoleCode, Set<PermissionKey>> | null = null;
let cacheLoadedAt = 0;

export const invalidateRbacCache = () => {
  permissionsByRole = null;
};

const loadPermissionsByRole = async () => {
  if (permissionsByRole && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return permissionsByRole;
  const roles = await Role.findAll({ include: [{ model: Permission, attributes: ['entity', 'action'], through: { attributes: [] } }] });
  permissionsByRole = new Map(roles.map((role) => [role.code, new Set((role.Permissions ?? []).map((p) => permissionKey(p.entity, p.action)))]));
  cacheLoadedAt = Date.now();
  return permissionsByRole;
};

/** Unión de los permisos de todos los roles de una persona. */
export const permissionsForRoles = async (roles: RoleCode[]): Promise<Set<PermissionKey>> => {
  const byRole = await loadPermissionsByRole();
  const result = new Set<PermissionKey>();
  for (const role of roles) byRole.get(role)?.forEach((key) => result.add(key));
  return result;
};

/** Roles de plataforma activos de un usuario (hoy solo SUPERADMIN). */
export const platformRolesOf = async (userId: number): Promise<RoleCode[]> =>
  (await UserRole.findAll({ where: { userId, schoolId: { [Op.is]: null }, active: true }, attributes: ['role'], raw: true })).map((r) => r.role);

/** Asigna un rol de plataforma (ej: SUPERADMIN). Idempotente; reactiva si estaba dado de baja. */
export const grantPlatformRole = async (userId: number, role: RoleCode) => {
  const [userRole, created] = await UserRole.findOrCreate({
    where: { userId, role, schoolId: { [Op.is]: null } } as never,
    defaults: { userId, role, schoolId: null, levelId: null, title: null },
  });
  if (!created && !userRole.active) await userRole.update({ active: true });
};

/** Quita un rol de plataforma (baja lógica). */
export const revokePlatformRole = async (userId: number, role: RoleCode) => {
  await UserRole.update({ active: false }, { where: { userId, role, schoolId: { [Op.is]: null } } as never });
};

/**
 * Crea en la base los roles y permisos del catálogo que todavía no existen. Idempotente.
 * Un permiso nuevo se vincula a los roles que lo tienen por defecto; un rol nuevo, a todos sus permisos por defecto.
 */
export const syncRbacCatalog = async () => {
  const permissionIdByKey = new Map<PermissionKey, number>();
  const newPermissionKeys = new Set<PermissionKey>();
  for (const definition of PERMISSION_CATALOG) {
    const [permission, created] = await Permission.findOrCreate({
      where: { entity: definition.entity, action: definition.action },
      defaults: { entity: definition.entity, action: definition.action, description: definition.description },
    });
    if (!created && permission.description !== definition.description) await permission.update({ description: definition.description });
    const key = permissionKey(definition.entity, definition.action);
    permissionIdByKey.set(key, permission.id);
    if (created) newPermissionKeys.add(key);
  }

  for (const definition of ROLE_CATALOG) {
    const attributes = {
      code: definition.code,
      name: definition.name,
      scope: definition.scope,
      category: definition.category,
      rank: definition.rank,
      schoolWide: definition.schoolWide,
      leadership: definition.leadership,
      description: definition.description,
    };
    const [role, created] = await Role.findOrCreate({ where: { code: definition.code }, defaults: { ...attributes, schoolId: null } });
    if (!created) await role.update(attributes);
    const defaults = definition.defaultPermissions
      .map(([entity, action]) => permissionKey(entity, action))
      .filter((key) => created || newPermissionKeys.has(key));
    if (defaults.length) {
      await RolePermission.bulkCreate(
        defaults.map((key) => ({ roleId: role.id, permissionId: permissionIdByKey.get(key)! })),
        { ignoreDuplicates: true }
      );
    }
  }
  invalidateRbacCache();
  invalidateRoleRegistry();
};

/** Catálogo para la matriz "Roles y permisos" de la app (lee la base: muestra lo que realmente se aplica). */
export const roleCatalogForDisplay = async (schoolId: number) => {
  const roles = await Role.findAll({
    where: { scope: RoleScope.SCHOOL, [Op.or]: [{ schoolId: null }, { schoolId }] },
    include: [{ model: Permission, attributes: ['entity', 'action'], through: { attributes: [] } }],
    order: [['rank', 'DESC'], ['name', 'ASC']],
  });
  return {
    permissions: PERMISSION_CATALOG.filter((p) => p.group !== 'Plataforma').map((p) => ({ key: permissionKey(p.entity, p.action), ...p })),
    roles: roles.map((role) => ({
      code: role.code,
      name: role.name,
      category: role.category,
      rank: role.rank,
      schoolWide: role.schoolWide,
      leadership: role.leadership,
      description: role.description,
      custom: role.schoolId != null,
      permissions: (role.Permissions ?? []).map((p) => permissionKey(p.entity, p.action)),
    })),
  };
};

