/**
 * Registro de roles en ejecución: el catálogo de constants/roles.ts MÁS los roles personalizados
 * que cada colegio crea (Role.schoolId ≠ null). Todo lo que antes miraba el catálogo estático
 * (nombre, jerarquía, categoría, alcance) pasa por acá, así un rol creado por la Rectora se
 * comporta igual que uno del catálogo.
 *
 * Se guarda en memoria (5 minutos o hasta invalidar). Si todavía no se cargó, responde con el catálogo.
 */
import { Role } from '../models';
import { ROLE_CATALOG, RoleCode, NON_STAFF_ROLES, SchoolRole, Category, CATEGORIES, isStaffRole } from '../constants/roles';

export interface RoleInfo {
  code: string;
  name: string;
  category: Category | null;
  rank: number;
  schoolWide: boolean;
  leadership: boolean;
  /** null = rol del catálogo (vale para todos los colegios). */
  schoolId: number | null;
  description: string;
  custom: boolean;
}

const TTL_MS = 5 * 60_000;
let cache: Map<string, RoleInfo> | null = null;
let loadedAt = 0;

const fromCatalog = () =>
  new Map<string, RoleInfo>(
    ROLE_CATALOG.map((r) => [r.code, { code: r.code, name: r.name, category: r.category, rank: r.rank, schoolWide: r.schoolWide, leadership: r.leadership, schoolId: null, description: r.description, custom: false }])
  );

export const invalidateRoleRegistry = () => {
  cache = null;
  loadedAt = 0;
};

/** Carga (o refresca) el registro desde la base. Se llama al armar cada sesión escolar. */
export const loadRoles = async () => {
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  const rows = await Role.findAll();
  const next = fromCatalog();
  for (const r of rows) {
    next.set(r.code, { code: r.code, name: r.name, category: r.category, rank: r.rank, schoolWide: r.schoolWide, leadership: r.leadership, schoolId: r.schoolId ?? null, description: r.description, custom: r.schoolId != null });
  }
  cache = next;
  loadedAt = Date.now();
  return cache;
};

/** Lectura sincrónica: usa lo cargado o, si todavía no hay nada, el catálogo (sin marcar como cargado). */
const registry = () => cache ?? fromCatalog();

export const roleInfo = (code: string) => registry().get(code);
export const roleLabel = (code: string) => roleInfo(code)?.name ?? code;
export const roleRank = (code: string) => roleInfo(code)?.rank ?? 0;
export const roleCategory = (code: string): Category | null => roleInfo(code)?.category ?? null;
export const isSchoolWideRole = (code: string) => !!roleInfo(code)?.schoolWide;
export const isCustomRole = (code: string) => !!roleInfo(code)?.custom;
export const highestRankOf = (codes: string[]) => Math.max(0, ...codes.map(roleRank));

/** La categoría "más alta" de una persona (una docente que además es madre es Docente). */
export const categoryOfRoles = (codes: string[]): Category | null => {
  for (const category of CATEGORIES) if (codes.some((code) => roleCategory(code) === category)) return category;
  return null;
};

/** ¿Es un rol de colegio válido para ese colegio? (catálogo, o personalizado de ese mismo colegio). */
export const isKnownSchoolRole = (code: string, schoolId: number) => {
  const r = roleInfo(code);
  return !!r && r.code !== RoleCode.SUPERADMIN && (r.schoolId == null || r.schoolId === schoolId);
};

/** Roles de personal disponibles en un colegio (catálogo + personalizados propios). */
export const staffRoleCodes = (schoolId: number) =>
  [...registry().values()].filter((r) => r.code !== RoleCode.SUPERADMIN && (r.schoolId == null || r.schoolId === schoolId) && !NON_STAFF_ROLES.includes(r.code as SchoolRole)).map((r) => r.code);

export const customRolesOf = (schoolId: number) => [...registry().values()].filter((r) => r.schoolId === schoolId);

/** Roles de conducción (reciben mensajes de familias y alertas) válidos en ese colegio. */
export const leadershipRoleCodes = async (schoolId: number) => {
  await loadRoles();
  return [...registry().values()].filter((r) => r.leadership && (r.schoolId == null || r.schoolId === schoolId)).map((r) => r.code);
};

/** Roles que puede otorgar una persona: solo de menor jerarquía que la propia (RL y superadmin: todos). */
export const grantableRoleCodes = (session: { roles: string[]; superAdmin: boolean; schoolId: number }) => {
  const top = session.superAdmin || session.roles.includes(RoleCode.REPRESENTANTE_LEGAL);
  const own = session.superAdmin ? 1000 : highestRankOf(session.roles.filter((r) => isStaffRole(r as RoleCode)));
  return staffRoleCodes(session.schoolId).filter((code) => top || roleRank(code) < own);
};
