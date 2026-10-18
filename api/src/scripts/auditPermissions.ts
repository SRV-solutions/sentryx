/**
 * Auditoría automática de permisos: `npm run audit:permissions` (no necesita base de datos).
 * Sale con código 1 si algo falla: sirve para correrlo en CI antes de desplegar.
 *
 * 1. Toda ruta de /school y /platform que ESCRIBE (POST/PUT/PATCH/DELETE) tiene un authorize(Entity, Action),
 *    salvo las de la lista blanca de familias/estudiantes (mensajes, confirmaciones, adjuntos propios),
 *    que validan el acceso dentro del controlador.
 * 2. Familias y estudiantes solo pueden escribir en esa lista blanca.
 * 3. Familia y Estudiante no tienen permisos por defecto; los roles solo usan permisos que existen.
 * 4. Toda ruta de /platform exige un permiso de plataforma.
 */
import type { Router } from 'express';
import { apiRouter } from '../routes';
import { isAllowedForNonStaff, NON_STAFF_WRITE_ALLOWLIST } from '../middlewares/nonStaffWriteGuard';
import { ROLE_CATALOG, RoleCode } from '../constants/roles';
import { PERMISSION_CATALOG, permissionKey } from '../constants/permissions';
import { sequelize } from '../models';

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: Layer[] };
  name: string;
  handle: Router & { stack: Layer[] };
  regexp: RegExp;
}
interface RouteInfo {
  method: string;
  path: string;
  /** Nombres de los middlewares de la ruta y de los routers que la contienen. */
  guards: string[];
}

const prefixOf = (re: RegExp) => {
  const match = /^\/\^\\\/(.*?)\\\/\?\(\?=/.exec(re.toString());
  return match ? '/' + match[1].replace(/\\\//g, '/') : '';
};

const collect = (stack: Layer[], prefix = '', inherited: string[] = []): RouteInfo[] => {
  const result: RouteInfo[] = [];
  const guardsSoFar = [...inherited];
  for (const layer of stack) {
    if (layer.route) {
      const own = layer.route.stack.map((l) => l.name);
      for (const method of Object.keys(layer.route.methods)) result.push({ method: method.toUpperCase(), path: prefix + layer.route.path, guards: [...guardsSoFar, ...own] });
    } else if (layer.name === 'router' && layer.handle?.stack) {
      result.push(...collect(layer.handle.stack, prefix + prefixOf(layer.regexp), guardsSoFar));
    } else {
      guardsSoFar.push(layer.name);
    }
  }
  return result;
};

/** '/threads/:id/messages' → '/threads/1/messages'; ':action(hide|unhide)' → 'hide'. */
const samplePath = (path: string) => path.replace(/:\w+\(([^|)]+)[^)]*\)/g, '$1').replace(/:\w+/g, '1');

let failures = 0;
const fail = (message: string) => {
  failures++;
  console.log(`  ✗ ${message}`);
};

const routes = collect((apiRouter as unknown as { stack: Layer[] }).stack);
const writes = routes.filter((r) => r.method !== 'GET' && (r.path.startsWith('/school') || r.path.startsWith('/platform')));
const DEVICE_ROUTES = /^\/school\/push\//;
const hasAuthorize = (route: RouteInfo) => route.guards.some((g) => g === 'authorize' || g.startsWith('authorize'));

console.log(`\n1) Rutas que escriben en /school y /platform: ${writes.length}`);
for (const route of writes) {
  const schoolRelative = route.path.replace(/^\/school/, '');
  const allowedForFamilies = route.path.startsWith('/school') && isAllowedForNonStaff(route.method, samplePath(schoolRelative));
  const label = hasAuthorize(route) ? 'authorize' : allowedForFamilies ? 'lista blanca' : DEVICE_ROUTES.test(route.path) ? 'dispositivo propio' : route.guards.includes('requireStaff') ? 'solo personal' : 'SIN CONTROL';
  console.log(`  ${label === 'SIN CONTROL' ? '✗' : '✓'} ${route.method.padEnd(6)} ${route.path.padEnd(48)} ${label}`);
  if (label === 'SIN CONTROL') fail(`${route.method} ${route.path} no exige ningún permiso`);
}

console.log('\n2) Familias y estudiantes: solo la lista blanca');
for (const rule of NON_STAFF_WRITE_ALLOWLIST) {
  const exists = writes.some((r) => r.method === rule.method && rule.path.test(samplePath(r.path.replace(/^\/school/, ''))));
  if (!exists) fail(`La regla ${rule.method} ${rule.path} no corresponde a ninguna ruta`);
  else console.log(`  ✓ ${rule.method.padEnd(6)} ${rule.why}`);
}
for (const blocked of ['POST /classrooms/1/posts', 'POST /divisions', 'POST /subjects', 'PATCH /settings', 'PUT /grades/sheet', 'POST /announcements', 'POST /staff', 'POST /students']) {
  const [method, path] = blocked.split(' ');
  if (isAllowedForNonStaff(method, path)) fail(`Familia/Estudiante podría ${blocked}`);
}

console.log('\n3) Catálogo de roles');
const existing = new Set(PERMISSION_CATALOG.map((p) => permissionKey(p.entity, p.action)));
for (const role of ROLE_CATALOG) {
  const unknown = role.defaultPermissions.filter(([e, a]) => !existing.has(permissionKey(e, a)));
  if (unknown.length) fail(`${role.code} usa permisos inexistentes: ${unknown.map(([e, a]) => `${e}:${a}`).join(', ')}`);
  if ((role.code === RoleCode.TUTOR || role.code === RoleCode.ESTUDIANTE) && role.defaultPermissions.length) fail(`${role.code} no debería tener permisos`);
  const hasPlatformPermission = role.defaultPermissions.some(([e, a]) => PERMISSION_CATALOG.find((p) => p.entity === e && p.action === a)?.group === 'Plataforma');
  if (role.scope === 'SCHOOL' && hasPlatformPermission) fail(`${role.code} (rol de colegio) tiene un permiso de plataforma`);
  console.log(`  ✓ ${role.code.padEnd(20)} ${role.defaultPermissions.length} permisos por defecto`);
}

console.log('\n4) /platform: solo con permiso de plataforma');
for (const route of routes.filter((r) => r.path.startsWith('/platform'))) {
  if (!route.guards.includes('authenticate') || !hasAuthorize(route)) fail(`${route.method} ${route.path} sin authorize`);
  else console.log(`  ✓ ${route.method.padEnd(6)} ${route.path}`);
}

console.log(failures ? `\n❌ ${failures} problema(s) de permisos\n` : '\n✅ Permisos OK\n');
sequelize.close().finally(() => process.exit(failures ? 1 : 0));
