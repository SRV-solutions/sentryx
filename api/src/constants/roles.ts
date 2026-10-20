import { Entity, Action } from './permissions';

/**
 * ROLES
 *
 * Modelo: un USUARIO tiene muchos ROLES (tabla UserRole) y un ROL tiene muchos PERMISOS
 * (tabla RolePermission). Un permiso es una ACCIÓN sobre una ENTIDAD (constants/permissions.ts).
 *
 * Hay dos alcances de rol:
 *  - PLATFORM: SUPERADMIN, el equipo de Sentryx (alta de colegios, facturación de todos).
 *  - SCHOOL: roles dentro de un colegio. La asignación (UserRole) dice en qué colegio y, si
 *    corresponde, en qué nivel o divisiones. Una persona puede ser Docente en un colegio y
 *    Familia en otro, o Rectora y Docente en el mismo.
 *
 * Este catálogo es la configuración POR DEFECTO: al arrancar, services/rbac.ts crea en la base los
 * roles y permisos que falten con estos vínculos. Lo que se cambie después en la base se respeta.
 */

export const RoleCode = {
  SUPERADMIN: 'SUPERADMIN',
  REPRESENTANTE_LEGAL: 'REPRESENTANTE_LEGAL',
  DIRECTOR: 'DIRECTOR',
  VICEDIRECTOR: 'VICEDIRECTOR',
  RECTOR: 'RECTOR',
  SECRETARIO: 'SECRETARIO',
  PRECEPTOR: 'PRECEPTOR',
  COORDINADOR: 'COORDINADOR',
  JEFE_PRECEPTORES: 'JEFE_PRECEPTORES',
  ADMINISTRACION: 'ADMINISTRACION',
  DOCENTE: 'DOCENTE',
  TUTOR: 'TUTOR',
  ESTUDIANTE: 'ESTUDIANTE',
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

/** Roles que se asignan dentro de un colegio (todos menos SUPERADMIN). */
export type SchoolRole = Exclude<RoleCode, 'SUPERADMIN'>;

export const RoleScope = { PLATFORM: 'PLATFORM', SCHOOL: 'SCHOOL' } as const;
export type RoleScope = (typeof RoleScope)[keyof typeof RoleScope];

/** Vista simple de "quién es quién" dentro de un colegio. */
export const CATEGORIES = ['DIRECTIVO', 'DOCENTE', 'FAMILIA', 'ESTUDIANTE'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  DIRECTIVO: 'Directivo / Administrativo',
  DOCENTE: 'Docente',
  FAMILIA: 'Familia',
  ESTUDIANTE: 'Estudiante',
};

type PermissionPair = [Entity, Action];

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  scope: RoleScope;
  /** Solo roles de colegio. */
  category: Category | null;
  /** Jerarquía: solo se otorgan, editan o blanquean cuentas de roles de rango MENOR al propio. */
  rank: number;
  /** Alcance sobre toda la institución aunque no tenga nivel asignado. */
  schoolWide: boolean;
  /** Conducción de nivel: recibe mensajes de familias de su nivel y alertas. */
  leadership: boolean;
  description: string;
  defaultPermissions: PermissionPair[];
}

const schoolPermissionsExcept = (...excluded: PermissionPair[]): PermissionPair[] =>
  ALL_SCHOOL_PERMISSIONS.filter(([e, a]) => !excluded.some(([xe, xa]) => xe === e && xa === a));

const ALL_SCHOOL_PERMISSIONS: PermissionPair[] = [
  [Entity.SCHOOL, Action.UPDATE],
  [Entity.ROLES, Action.MANAGE],
  [Entity.BILLING, Action.READ],
  [Entity.AUDIT_LOG, Action.READ],
  [Entity.USERS, Action.READ],
  [Entity.USERS, Action.CREATE],
  [Entity.USERS, Action.UPDATE],
  [Entity.CONTACT_INFO, Action.READ],
  [Entity.ANNOUNCEMENTS, Action.CREATE],
  [Entity.ANNOUNCEMENTS, Action.CREATE_SCHOOL_WIDE],
  [Entity.ANNOUNCEMENTS, Action.READ_STATS],
  [Entity.MESSAGES, Action.MANAGE],
  [Entity.CHANNELS, Action.MODERATE],
  [Entity.CLASSROOM_POSTS, Action.CREATE],
  [Entity.CLASSROOM_POSTS, Action.UPDATE],
  [Entity.GRADES, Action.READ],
  [Entity.GRADES, Action.UPDATE],
  [Entity.GRADES, Action.UPDATE_ANY],
  [Entity.GRADING_PERIODS, Action.CLOSE],
  [Entity.REPORT_CARDS, Action.PUBLISH],
  [Entity.ATTENDANCE, Action.READ],
  [Entity.ATTENDANCE, Action.UPDATE],
  [Entity.ALERTS, Action.READ],
  [Entity.ALERTS, Action.UPDATE],
  [Entity.ALERT_RULES, Action.UPDATE],
  [Entity.PLANS, Action.READ],
  [Entity.PLANS, Action.UPDATE],
  [Entity.STAFF_RECORDS, Action.READ],
  [Entity.STAFF_RECORDS, Action.UPDATE],
  [Entity.PAYROLL, Action.READ],
  [Entity.PAYROLL, Action.CREATE],
  [Entity.PAYROLL, Action.DELETE],
  [Entity.EVENTS, Action.READ],
  [Entity.EVENTS, Action.CREATE],
  [Entity.EVENTS, Action.UPDATE],
  [Entity.EVENTS, Action.DELETE],
  [Entity.SUBJECT_PROGRAMS, Action.CREATE],
  [Entity.SUBJECT_PROGRAMS, Action.READ],
  [Entity.SUBJECT_PROGRAMS, Action.UPDATE],
  [Entity.QUIZZES, Action.CREATE],
  [Entity.QUIZZES, Action.READ],
];

/** Lo que solo decide la Representante Legal: planes (lo que se cobra) y sueldos. */
const LEGAL_REP_ONLY: PermissionPair[] = [
  [Entity.BILLING, Action.READ],
  [Entity.PLANS, Action.UPDATE],
  [Entity.PAYROLL, Action.READ],
  [Entity.PAYROLL, Action.CREATE],
  [Entity.PAYROLL, Action.DELETE],
];

export const ROLE_CATALOG: RoleDefinition[] = [
  {
    code: RoleCode.SUPERADMIN, name: 'Superadmin Sentryx', scope: RoleScope.PLATFORM, category: null, rank: 1000, schoolWide: true, leadership: false,
    description: 'Equipo de Sentryx: alta de colegios, soporte y facturación de la plataforma.',
    defaultPermissions: [
      [Entity.SCHOOLS, Action.READ], [Entity.SCHOOLS, Action.CREATE], [Entity.SCHOOLS, Action.UPDATE], [Entity.SCHOOLS, Action.DELETE],
      [Entity.PLATFORM_BILLING, Action.READ], [Entity.NOTIFICATIONS, Action.BROADCAST],
      [Entity.SUPPORT_REPORTS, Action.READ], [Entity.SUPPORT_REPORTS, Action.UPDATE], [Entity.PLATFORM_AUDIT, Action.READ],
    ],
  },
  {
    code: RoleCode.REPRESENTANTE_LEGAL, name: 'Representante Legal', scope: RoleScope.SCHOOL, category: 'DIRECTIVO', rank: 100, schoolWide: true, leadership: false,
    description: 'Máxima autoridad: todos los niveles, toda la configuración y la facturación.',
    defaultPermissions: ALL_SCHOOL_PERMISSIONS,
  },
  {
    code: RoleCode.DIRECTOR, name: 'Dirección', scope: RoleScope.SCHOOL, category: 'DIRECTIVO', rank: 80, schoolWide: false, leadership: true,
    description: 'Conduce un nivel (o todos si no tiene nivel asignado).',
    defaultPermissions: schoolPermissionsExcept(...LEGAL_REP_ONLY),
  },
  {
    code: RoleCode.RECTOR, name: 'Rectoría', scope: RoleScope.SCHOOL, category: 'DIRECTIVO', rank: 80, schoolWide: false, leadership: true,
    description: 'Conduce el nivel Secundario.',
    defaultPermissions: schoolPermissionsExcept(...LEGAL_REP_ONLY),
  },
  {
    code: RoleCode.VICEDIRECTOR, name: 'Vicedirección', scope: RoleScope.SCHOOL, category: 'DIRECTIVO', rank: 70, schoolWide: false, leadership: true,
    description: 'Acompaña a la conducción del nivel; no modifica la estructura de la institución.',
    defaultPermissions: schoolPermissionsExcept(...LEGAL_REP_ONLY, [Entity.SCHOOL, Action.UPDATE], [Entity.EVENTS, Action.DELETE]),
  },
  {
    code: RoleCode.COORDINADOR, name: 'Coordinación pedagógica', scope: RoleScope.SCHOOL, category: 'DIRECTIVO', rank: 65, schoolWide: false, leadership: true,
    description: 'Acompaña lo pedagógico de su nivel: notas, aulas, programas y seguimiento. No publica boletines ni toca la estructura.',
    defaultPermissions: schoolPermissionsExcept(...LEGAL_REP_ONLY, [Entity.SCHOOL, Action.UPDATE], [Entity.EVENTS, Action.DELETE], [Entity.REPORT_CARDS, Action.PUBLISH], [Entity.ROLES, Action.MANAGE]),
  },
  {
    code: RoleCode.SECRETARIO, name: 'Secretaría', scope: RoleScope.SCHOOL, category: 'DIRECTIVO', rank: 60, schoolWide: true, leadership: false,
    description: 'Legajos, altas y comunicación institucional.',
    defaultPermissions: [
      [Entity.USERS, Action.READ], [Entity.USERS, Action.CREATE], [Entity.USERS, Action.UPDATE], [Entity.CONTACT_INFO, Action.READ],
      [Entity.ANNOUNCEMENTS, Action.CREATE], [Entity.ANNOUNCEMENTS, Action.CREATE_SCHOOL_WIDE], [Entity.ANNOUNCEMENTS, Action.READ_STATS],
      [Entity.MESSAGES, Action.MANAGE], [Entity.CHANNELS, Action.MODERATE],
      // Lee notas pero NO publica boletines: eso lo decide la conducción (Dirección, Rectoría, Vicedirección).
      [Entity.GRADES, Action.READ], [Entity.ATTENDANCE, Action.READ], [Entity.ALERTS, Action.READ],
      [Entity.PLANS, Action.READ], [Entity.STAFF_RECORDS, Action.READ], [Entity.STAFF_RECORDS, Action.UPDATE],
      [Entity.EVENTS, Action.READ], [Entity.EVENTS, Action.CREATE], [Entity.EVENTS, Action.UPDATE], [Entity.EVENTS, Action.DELETE],
      [Entity.SUBJECT_PROGRAMS, Action.READ],
    ],
  },
  {
    code: RoleCode.ADMINISTRACION, name: 'Administración', scope: RoleScope.SCHOOL, category: 'DIRECTIVO', rank: 50, schoolWide: true, leadership: false,
    description: 'Familias, comunicación administrativa, legajos, recibos de sueldo y calendario. No ve notas.',
    defaultPermissions: [
      [Entity.USERS, Action.READ], [Entity.USERS, Action.CREATE], [Entity.USERS, Action.UPDATE], [Entity.CONTACT_INFO, Action.READ],
      [Entity.ANNOUNCEMENTS, Action.CREATE], [Entity.ANNOUNCEMENTS, Action.CREATE_SCHOOL_WIDE], [Entity.ANNOUNCEMENTS, Action.READ_STATS],
      [Entity.MESSAGES, Action.MANAGE],
      [Entity.PLANS, Action.READ], [Entity.STAFF_RECORDS, Action.READ], [Entity.STAFF_RECORDS, Action.UPDATE],
      [Entity.PAYROLL, Action.READ], [Entity.PAYROLL, Action.CREATE], [Entity.PAYROLL, Action.DELETE],
      [Entity.EVENTS, Action.READ], [Entity.EVENTS, Action.CREATE], [Entity.EVENTS, Action.UPDATE],
    ],
  },
  {
    code: RoleCode.PRECEPTOR, name: 'Preceptoría', scope: RoleScope.SCHOOL, category: 'DIRECTIVO', rank: 40, schoolWide: false, leadership: false,
    description: 'Asistencia, alertas y seguimiento de sus divisiones.',
    defaultPermissions: [
      [Entity.USERS, Action.READ], [Entity.CONTACT_INFO, Action.READ],
      [Entity.ANNOUNCEMENTS, Action.CREATE], [Entity.ANNOUNCEMENTS, Action.READ_STATS], [Entity.MESSAGES, Action.MANAGE], [Entity.CHANNELS, Action.MODERATE],
      [Entity.CLASSROOM_POSTS, Action.CREATE], [Entity.CLASSROOM_POSTS, Action.UPDATE],
      [Entity.GRADES, Action.READ], [Entity.ATTENDANCE, Action.READ], [Entity.ATTENDANCE, Action.UPDATE],
      [Entity.ALERTS, Action.READ], [Entity.ALERTS, Action.UPDATE],
      [Entity.EVENTS, Action.READ], [Entity.QUIZZES, Action.CREATE],
    ],
  },
  {
    code: RoleCode.JEFE_PRECEPTORES, name: 'Jefatura de preceptores', scope: RoleScope.SCHOOL, category: 'DIRECTIVO', rank: 45, schoolWide: false, leadership: false,
    description: 'Coordina a preceptoría: asistencia, alertas y seguimiento de TODAS las divisiones de su nivel.',
    defaultPermissions: [
      [Entity.USERS, Action.READ], [Entity.CONTACT_INFO, Action.READ],
      [Entity.ANNOUNCEMENTS, Action.CREATE], [Entity.ANNOUNCEMENTS, Action.READ_STATS], [Entity.MESSAGES, Action.MANAGE], [Entity.CHANNELS, Action.MODERATE],
      [Entity.CLASSROOM_POSTS, Action.CREATE], [Entity.CLASSROOM_POSTS, Action.UPDATE],
      [Entity.GRADES, Action.READ], [Entity.ATTENDANCE, Action.READ], [Entity.ATTENDANCE, Action.UPDATE],
      [Entity.ALERTS, Action.READ], [Entity.ALERTS, Action.UPDATE],
      [Entity.EVENTS, Action.READ], [Entity.QUIZZES, Action.CREATE],
    ],
  },
  {
    code: RoleCode.DOCENTE, name: 'Docente', scope: RoleScope.SCHOOL, category: 'DOCENTE', rank: 30, schoolWide: false, leadership: false,
    description: 'Carga notas, toma asistencia y publica material SOLO en sus cursos; no ve contactos de las familias.',
    defaultPermissions: [
      [Entity.USERS, Action.READ], [Entity.ANNOUNCEMENTS, Action.CREATE], [Entity.MESSAGES, Action.MANAGE], [Entity.CHANNELS, Action.MODERATE],
      [Entity.CLASSROOM_POSTS, Action.CREATE], [Entity.CLASSROOM_POSTS, Action.UPDATE], [Entity.GRADES, Action.UPDATE],
      // Las maestras de grado/sala toman la asistencia de su curso (desde la web o el celular); el alcance sigue siendo solo sus divisiones.
      [Entity.ATTENDANCE, Action.READ], [Entity.ATTENDANCE, Action.UPDATE], [Entity.ALERTS, Action.READ],
      [Entity.EVENTS, Action.READ], [Entity.SUBJECT_PROGRAMS, Action.CREATE], [Entity.QUIZZES, Action.CREATE],
    ],
  },
  {
    code: RoleCode.TUTOR, name: 'Familia', scope: RoleScope.SCHOOL, category: 'FAMILIA', rank: 0, schoolWide: false, leadership: false,
    description: 'Ve a sus hijos: comunicados, boletín publicado, asistencia, aula y mensajes con la escuela.',
    defaultPermissions: [],
  },
  {
    code: RoleCode.ESTUDIANTE, name: 'Estudiante', scope: RoleScope.SCHOOL, category: 'ESTUDIANTE', rank: 0, schoolWide: false, leadership: false,
    description: 'Secundario: su boletín publicado, aulas, canales de su curso y mensajes con sus docentes.',
    defaultPermissions: [],
  },
];

// ---------------- Derivados del catálogo (no editar) ----------------

const SCHOOL_ROLE_DEFINITIONS = ROLE_CATALOG.filter((r) => r.scope === RoleScope.SCHOOL);
const definitionOf = (code: RoleCode) => ROLE_CATALOG.find((r) => r.code === code)!;

export const SCHOOL_ROLES = SCHOOL_ROLE_DEFINITIONS.map((r) => r.code as SchoolRole) as [SchoolRole, ...SchoolRole[]];
export const ROLE_LABELS = Object.fromEntries(ROLE_CATALOG.map((r) => [r.code, r.name])) as Record<RoleCode, string>;
export const ROLE_CATEGORY = Object.fromEntries(SCHOOL_ROLE_DEFINITIONS.map((r) => [r.code, r.category])) as Record<SchoolRole, Category>;
export const ROLE_RANK = Object.fromEntries(ROLE_CATALOG.map((r) => [r.code, r.rank])) as Record<RoleCode, number>;
export const SCHOOL_WIDE_ROLES = SCHOOL_ROLE_DEFINITIONS.filter((r) => r.schoolWide).map((r) => r.code as SchoolRole);
export const LEADERSHIP_ROLES = SCHOOL_ROLE_DEFINITIONS.filter((r) => r.leadership).map((r) => r.code as SchoolRole);
export const NON_STAFF_ROLES: SchoolRole[] = [RoleCode.TUTOR, RoleCode.ESTUDIANTE];
/** Roles de preceptoría: reciben alertas de asistencia y son contacto de las familias de sus divisiones. */
export const PRECEPTOR_ROLES: SchoolRole[] = [RoleCode.PRECEPTOR, RoleCode.JEFE_PRECEPTORES];
export const STAFF_ROLES = SCHOOL_ROLES.filter((r) => !NON_STAFF_ROLES.includes(r));

/** Personal de la institución (no familia, no estudiante, no rol de plataforma). */
export const isStaffRole = (role: RoleCode): role is SchoolRole => role !== RoleCode.SUPERADMIN && !NON_STAFF_ROLES.includes(role);
export const highestRank = (roles: RoleCode[]) => Math.max(0, ...roles.map((role) => ROLE_RANK[role]));
export const roleDefinition = definitionOf;

/** La categoría "más alta" de una persona (una docente que además es madre es Docente). */
export const categoryOf = (roles: SchoolRole[]): Category | null => {
  for (const category of CATEGORIES) if (roles.some((role) => ROLE_CATEGORY[role] === category)) return category;
  return null;
};

/** Roles de personal que puede otorgar quien tiene esos roles (la Representante Legal y el superadmin: todos). */
export const grantableRoles = (roles: SchoolRole[], isSuperAdmin = false): SchoolRole[] => {
  const isTopAuthority = isSuperAdmin || roles.includes(RoleCode.REPRESENTANTE_LEGAL);
  const ownRank = highestRank(roles.filter(isStaffRole));
  return STAFF_ROLES.filter((role) => isTopAuthority || ROLE_RANK[role] < ownRank);
};
