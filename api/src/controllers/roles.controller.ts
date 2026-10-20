/**
 * Roles personalizados del colegio (routes/school.routes.ts → /school/roles).
 * La conducción arma un rol eligiendo permisos del catálogo (acciones concretas) y lo asigna a su personal
 * como cualquier otro. Reglas: solo permisos que quien lo crea ya tiene (nadie reparte lo que no posee),
 * jerarquía siempre menor a la propia, y un rol en uso no se elimina.
 */
import { z } from 'zod';
import { Op } from 'sequelize';
import { Role, RolePermission, Permission, UserRole, sequelize } from '../models';
import { asyncHandler, badRequest, forbidden, notFound, idParam } from '../lib/http';
import { PERMISSION_CATALOG, permissionKey, PermissionKey } from '../constants/permissions';
import { RoleScope, RoleCode, isStaffRole } from '../constants/roles';
import { invalidateRbacCache } from '../services/rbac';
import { invalidateRoleRegistry, highestRankOf, loadRoles } from '../services/roleRegistry';
import { invalidateSchoolSession } from '../services/schoolSession';
import { audit } from '../services/audit';

const SCHOOL_PERMISSION_KEYS = new Set(PERMISSION_CATALOG.filter((p) => p.group !== 'Plataforma').map((p) => permissionKey(p.entity, p.action)));

export const roleBody = z.object({
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().max(300).default(''),
  category: z.enum(['DIRECTIVO', 'DOCENTE']),
  permissions: z.array(z.string().max(60)).max(100),
  /** Recibe mensajes de familias y alertas de su nivel (como Dirección). */
  leadership: z.boolean().default(false),
  /** Alcance sobre toda la institución (sin nivel asignado). */
  schoolWide: z.boolean().default(false),
});
export const createRole = { body: roleBody };
export const updateRole = { params: z.object({ code: z.string().max(40) }), body: roleBody };
export const deleteRole = { params: z.object({ code: z.string().max(40) }) };
void idParam;

const ownRank = (session: { superAdmin: boolean; roles: string[] }) => (session.superAdmin ? 1000 : highestRankOf(session.roles.filter((r) => isStaffRole(r as RoleCode))));

/** Permisos válidos y que quien crea el rol ya tiene. */
const checkPermissions = (session: { permissions: Set<PermissionKey>; superAdmin: boolean }, keys: string[]) => {
  const unique = [...new Set(keys)];
  const unknown = unique.filter((k) => !SCHOOL_PERMISSION_KEYS.has(k as PermissionKey));
  if (unknown.length) throw badRequest(`Permiso desconocido: ${unknown.join(', ')}.`);
  const missing = unique.filter((k) => !session.superAdmin && !session.permissions.has(k as PermissionKey));
  if (missing.length) throw forbidden('Solo podés incluir permisos que vos ya tenés.');
  return unique as PermissionKey[];
};

const ownRole = async (schoolId: number, code: string) => {
  const role = await Role.findOne({ where: { code, schoolId } });
  if (!role) throw notFound('Ese rol no existe o no es de este colegio.');
  return role;
};

const setPermissions = async (roleId: number, keys: PermissionKey[], transaction: import('sequelize').Transaction) => {
  const perms = await Permission.findAll({ where: { [Op.or]: keys.map((k) => ({ entity: k.split(':')[0], action: k.split(':')[1] })) }, attributes: ['id'], transaction });
  await RolePermission.destroy({ where: { roleId }, transaction });
  if (perms.length) await RolePermission.bulkCreate(perms.map((p) => ({ roleId, permissionId: p.id })), { transaction });
};

const refresh = async (schoolId: number) => {
  invalidateRbacCache();
  invalidateRoleRegistry();
  await loadRoles();
  // Quien ya tenía el rol ve los permisos nuevos sin volver a entrar.
  const members = await UserRole.findAll({ where: { schoolId, active: true }, attributes: ['userId'], raw: true });
  new Set(members.map((m) => m.userId as number)).forEach((id) => invalidateSchoolSession(id));
};

// POST /roles
export const createCustomRole = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const input = req.body as z.infer<typeof roleBody>;
  const keys = checkPermissions(session, input.permissions);
  if (await Role.count({ where: { schoolId: session.schoolId, name: input.name } })) throw badRequest('Ya hay un rol con ese nombre.');
  // Jerarquía: debajo de quien lo crea. Directivo personalizado = 55 (entre Secretaría y Coordinación); docente = 30.
  const rank = Math.min(input.category === 'DIRECTIVO' ? 55 : 30, ownRank(session) - 1);
  if (rank < 1) throw forbidden('Tu jerarquía no permite crear roles.');
  const code = `CUSTOM_${session.schoolId}_${Date.now().toString(36).toUpperCase()}`;
  const role = await sequelize.transaction(async (transaction) => {
    const r = await Role.create(
      { code: code as RoleCode, name: input.name, scope: RoleScope.SCHOOL, category: input.category, rank, schoolWide: input.schoolWide, leadership: input.leadership, description: input.description, schoolId: session.schoolId },
      { transaction }
    );
    await setPermissions(r.id, keys, transaction);
    return r;
  });
  await refresh(session.schoolId);
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Role', entityId: role.id, action: 'create', after: { code, name: input.name, permissions: keys } });
  res.status(201).json({ ...role.toJSON(), permissions: keys, custom: true });
});

// PUT /roles/:code
export const updateCustomRole = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const input = req.body as z.infer<typeof roleBody>;
  const role = await ownRole(session.schoolId, req.params.code);
  if (!session.superAdmin && role.rank >= ownRank(session)) throw forbidden('Ese rol tiene una jerarquía igual o mayor a la tuya.');
  const keys = checkPermissions(session, input.permissions);
  const before = { name: role.name, description: role.description, leadership: role.leadership, schoolWide: role.schoolWide };
  await sequelize.transaction(async (transaction) => {
    await role.update({ name: input.name, description: input.description, category: input.category, leadership: input.leadership, schoolWide: input.schoolWide, rank: Math.min(input.category === 'DIRECTIVO' ? 55 : 30, ownRank(session) - 1) }, { transaction });
    await setPermissions(role.id, keys, transaction);
  });
  await refresh(session.schoolId);
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Role', entityId: role.id, action: 'update', before, after: { ...input, permissions: keys } });
  res.json({ ...role.toJSON(), permissions: keys, custom: true });
});

// DELETE /roles/:code
export const deleteCustomRole = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const role = await ownRole(session.schoolId, req.params.code);
  const inUse = await UserRole.count({ where: { role: role.code, active: true } });
  if (inUse) throw badRequest(`Hay ${inUse} ${inUse === 1 ? 'persona' : 'personas'} con este rol: quitáselo primero desde Personal.`);
  await sequelize.transaction(async (transaction) => {
    await UserRole.destroy({ where: { role: role.code }, transaction });
    await RolePermission.destroy({ where: { roleId: role.id }, transaction });
    await role.destroy({ transaction });
  });
  await refresh(session.schoolId);
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Role', entityId: role.id, action: 'delete', before: { code: role.code, name: role.name } });
  res.status(204).end();
});
