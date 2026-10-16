import { SchoolRole } from './constants';

/**
 * Permisos del dominio escolar. Se definen en código (no en la base) para que sean auditables,
 * tipados y no dependan de una consulta por request. El ALCANCE (qué divisiones/alumnos) lo resuelve scope.ts.
 */
export const PERMISSIONS = [
  'school.manage', // estructura: niveles, divisiones, materias, períodos, configuración
  'people.manage', // alta/baja de personal, alumnos, familias, importaciones
  'people.read', // ver alumnos y familias dentro del alcance
  'announcements.publish', // comunicados a divisiones/niveles dentro del alcance
  'announcements.publish.school', // comunicados a toda la institución
  'announcements.stats', // ver confirmaciones de lectura de otros autores
  'messages.staff', // recibir/contestar mensajes de familias e iniciar conversaciones
  'grades.write', // cargar notas en sus materias asignadas
  'grades.write.any', // corregir cualquier nota dentro del alcance
  'grades.read',
  'periods.close',
  'reportcards.publish',
  'attendance.write',
  'attendance.read',
  'alerts.read',
  'alerts.manage',
  'alerts.rules',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const LEADERSHIP: Permission[] = ALL.filter((p) => p !== 'school.manage');

export const ROLE_PERMISSIONS: Record<SchoolRole, Permission[]> = {
  REPRESENTANTE_LEGAL: ALL,
  DIRECTOR: ALL,
  RECTOR: ALL,
  VICEDIRECTOR: LEADERSHIP,
  SECRETARIO: [
    'people.manage',
    'people.read',
    'announcements.publish',
    'announcements.publish.school',
    'announcements.stats',
    'messages.staff',
    'grades.read',
    'reportcards.publish',
    'attendance.read',
    'alerts.read',
  ],
  ADMINISTRACION: [
    'people.manage',
    'people.read',
    'announcements.publish',
    'announcements.publish.school',
    'announcements.stats',
    'messages.staff',
  ],
  PRECEPTOR: [
    'people.read',
    'announcements.publish',
    'announcements.stats',
    'messages.staff',
    'grades.read',
    'attendance.write',
    'attendance.read',
    'alerts.read',
    'alerts.manage',
  ],
  DOCENTE: [
    'people.read',
    'announcements.publish',
    'messages.staff',
    'grades.write',
    'grades.read',
    'attendance.read',
    'alerts.read',
  ],
  TUTOR: [],
};

/** Roles cuyo alcance es toda la institución aunque no tengan nivel asignado. */
export const SCHOOL_WIDE_ROLES: SchoolRole[] = ['REPRESENTANTE_LEGAL', 'SECRETARIO', 'ADMINISTRACION'];

export const permissionsFor = (roles: SchoolRole[]): Set<Permission> =>
  new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]));
