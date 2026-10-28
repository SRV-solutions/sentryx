import type { PermissionKey } from './permissions';
/** Tipos del dominio escolar (espejo de api/src/school). Reutilizables por la futura app React Native. */

export type LevelType = 'INICIAL' | 'PRIMARIO' | 'SECUNDARIO';
export type SchoolRole =
  | 'REPRESENTANTE_LEGAL' | 'DIRECTOR' | 'VICEDIRECTOR' | 'RECTOR' | 'SECRETARIO'
  | 'COORDINADOR' | 'PRECEPTOR' | 'JEFE_PRECEPTORES' | 'ADMINISTRACION' | 'DOCENTE' | 'TUTOR' | 'ESTUDIANTE';
export type Category = 'DIRECTIVO' | 'DOCENTE' | 'FAMILIA' | 'ESTUDIANTE';
export const CATEGORY_LABELS: Record<Category, string> = { DIRECTIVO: 'Directivo / Administrativo', DOCENTE: 'Docente', FAMILIA: 'Familia', ESTUDIANTE: 'Estudiante' };
export const isStaffRole = (r: SchoolRole) => r !== 'TUTOR' && r !== 'ESTUDIANTE';
export type PeriodKind = 'CONCEPTUAL' | 'NUMERIC' | 'NARRATIVE';
export type AttendanceStatus = 'PRESENTE' | 'AUSENTE' | 'TARDE' | 'RETIRO';
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AudienceType = 'SCHOOL' | 'LEVEL' | 'DIVISION' | 'STUDENTS' | 'GUARDIANS' | 'STAFF' | 'USERS';
/** A quién de cada alumno le llega (SCHOOL/LEVEL/DIVISION/STUDENTS). Los estudiantes solo si tienen cuenta (Secundario). */
export type AudienceTarget = 'FAMILIES' | 'STUDENTS' | 'BOTH';
export const AUDIENCE_TARGET_LABELS: Record<AudienceTarget, string> = { FAMILIES: 'Familias', STUDENTS: 'Estudiantes', BOTH: 'Familias y estudiantes' };

/** Tipo de comunicado (espejo de ANNOUNCEMENT_CATEGORIES en api/src/constants/school.ts). */
export type AnnouncementCategory = 'INSTITUCIONAL' | 'ACADEMICO' | 'AULICO' | 'ASISTENCIA' | 'CONVIVENCIA' | 'ADMINISTRATIVO' | 'EVENTO' | 'CONSULTA';
export const ANNOUNCEMENT_CATEGORIES: AnnouncementCategory[] = ['INSTITUCIONAL', 'ACADEMICO', 'AULICO', 'ASISTENCIA', 'CONVIVENCIA', 'ADMINISTRATIVO', 'EVENTO', 'CONSULTA'];
export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  INSTITUCIONAL: 'Institucional', ACADEMICO: 'Académico', AULICO: 'Áulico', ASISTENCIA: 'Asistencia',
  CONVIVENCIA: 'Convivencia', ADMINISTRATIVO: 'Administrativo', EVENTO: 'Eventos y actos', CONSULTA: 'Consulta',
};
/** Para qué sirve cada tipo (ayuda en el compositor). */
export const ANNOUNCEMENT_CATEGORY_HINTS: Record<AnnouncementCategory, string> = {
  INSTITUCIONAL: 'Novedades generales de la escuela',
  ACADEMICO: 'Evaluaciones, notas, boletines, materias previas',
  AULICO: 'Lo del aula o la materia: tareas, materiales, recuperatorios',
  ASISTENCIA: 'Faltas, llegadas tarde, justificaciones',
  CONVIVENCIA: 'Situaciones de convivencia o disciplinarias',
  ADMINISTRATIVO: 'Cuotas, documentación, trámites',
  EVENTO: 'Actos, salidas, reuniones',
  CONSULTA: 'Una pregunta o pedido a la escuela',
};
/** Lo que pueden elegir familias y estudiantes al escribirle a la escuela. */
export const NON_STAFF_CATEGORIES: AnnouncementCategory[] = ['CONSULTA', 'ACADEMICO', 'ASISTENCIA', 'ADMINISTRATIVO'];

/** Convivencia (espejo de CONDUCT_KINDS). quantity: amonestaciones (cuántas) o suspensión (días). */
export type ConductKind = 'OBSERVACION' | 'LLAMADO_ATENCION' | 'APERCIBIMIENTO' | 'AMONESTACION' | 'SUSPENSION' | 'ACTA' | 'RECONOCIMIENTO' | 'RECTIFICACION';
export const CONDUCT_KINDS: ConductKind[] = ['OBSERVACION', 'LLAMADO_ATENCION', 'APERCIBIMIENTO', 'AMONESTACION', 'SUSPENSION', 'ACTA', 'RECONOCIMIENTO', 'RECTIFICACION'];
export const CONDUCT_KIND_LABELS: Record<ConductKind, string> = {
  OBSERVACION: 'Observación', LLAMADO_ATENCION: 'Llamado de atención', APERCIBIMIENTO: 'Apercibimiento', AMONESTACION: 'Amonestación',
  SUSPENSION: 'Suspensión', ACTA: 'Acta / acuerdo de convivencia', RECONOCIMIENTO: 'Reconocimiento', RECTIFICACION: 'Rectificación',
};
export const CONDUCT_KINDS_WITH_QUANTITY: ConductKind[] = ['AMONESTACION', 'SUSPENSION'];

export const ROLE_LABELS: Record<SchoolRole, string> = {
  REPRESENTANTE_LEGAL: 'Representante Legal', DIRECTOR: 'Dirección', VICEDIRECTOR: 'Vicedirección', RECTOR: 'Rectoría',
  SECRETARIO: 'Secretaría', COORDINADOR: 'Coordinación pedagógica', PRECEPTOR: 'Preceptoría', JEFE_PRECEPTORES: 'Jefatura de preceptores', ADMINISTRACION: 'Administración', DOCENTE: 'Docente', TUTOR: 'Familia', ESTUDIANTE: 'Estudiante',
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = { PRESENTE: 'Presente', AUSENTE: 'Ausente', TARDE: 'Tarde', RETIRO: 'Retiro ant.' };

export interface SchoolSummary { id: number; name: string; slug: string; logoUrl: string | null }

export interface SchoolSession {
  /** Funciones que dependen de la configuración del servidor (ej: adjuntos requieren el almacenamiento R2). */
  features?: { fileUploads: boolean; maxUploadMb?: number };
  school: { id: number; name: string; slug: string; logoUrl: string | null };
  /** Niveles a los que tiene acceso el personal (selector de nivel). */
  levels: Array<{ id: number; name: string; type: LevelType }>;
  activeLevelId: number | null;
  academicYearId: number | null;
  roles: SchoolRole[];
  roleLabels: string[];
  /** Claves "entidad:acción" (ver school/permissions.ts). */
  permissions: PermissionKey[];
  isStaff: boolean;
  isGuardian: boolean;
  scope: { all: boolean; levelIds: number[]; divisionIds: number[] };
  teaching: Array<{ divisionId: number; subjectId: number }>;
  childIds: number[];
  /** Directivo / Docente / Familia / Estudiante. */
  category: Category | null;
  categoryLabel: string | null;
  /** Cuenta de estudiante (Secundario): su legajo y división. */
  self: { studentId: number; divisionId: number | null } | null;
  hasChannels: boolean;
  /** Roles de personal que puede otorgar (calculado por el servidor según la jerarquía). */
  /** Códigos del catálogo o de roles personalizados del colegio. */
  grantableRoles: string[];
  /** Roles que puede ponerse o sacarse a sí mismo (superadmin: todos; el resto: de menor jerarquía). */
  selfGrantableRoles?: string[];
  /** Niveles donde puede crear cursos (la conducción de un nivel). */
  courseLevelIds?: number[];
  canManageRoles?: boolean;
  /** Plan de la persona (ver school/plans.ts). */
  plan: { code: import('./plans').PlanCode; name: string; storageGb: number; features: import('./plans').PlanFeature[] };
}

/** Modo de calificación por defecto de un nivel (cada período se puede cambiar igual). */
export type GradingMode = 'NUMERIC' | 'CONCEPTUAL' | 'NARRATIVE' | 'MIXED';
export const GRADING_MODE_LABELS: Record<GradingMode, string> = { NUMERIC: 'Solo números', CONCEPTUAL: 'Solo letras (escala)', NARRATIVE: 'Informes', MIXED: 'Mixto (Secundario)' };

export interface LevelSettings {
  gradingMode?: GradingMode;
  conceptualScale: string[];
  numericMin: number;
  numericMax: number;
  passingGrade: number;
  attendanceWeights: Record<Exclude<AttendanceStatus, 'PRESENTE'>, number>;
  /** Entrada, duración del módulo y recreos (Administración → Horarios). */
  timetable?: import('./timetable').Timetable;
}

export interface Level { id: number; type: LevelType; name: string; settings: LevelSettings }
export interface Division { id: number; name: string; levelId: number; gradeYear?: number; shift?: string | null; studentCount?: string | number; TeachingAssignments?: Assignment[] }
export interface Subject { id: number; name: string; levelId: number; code?: string | null; gradeYear?: number | null }
export interface Assignment { id: number; divisionId: number; subjectId: number; teacherId: number; Teacher?: PersonLite }
export interface Period { id: number; name: string; groupName: string | null; kind: PeriodKind; order?: number; levelId?: number; closed?: boolean; closedAt?: string | null; published?: boolean; startDate?: string | null; endDate?: string | null; /** Nota de cierre del grupo (ej: "1º Cuatrimestre"). */ summaryOf?: string | null }
export interface PersonLite { id: number; firstName: string; lastName: string; avatar?: string | null; photoUrl?: string | null }

export interface Structure { levels: Level[]; years: Array<{ id: number; year: number; isCurrent: boolean }>; divisions: Division[]; subjects: Subject[]; periods: Period[] }

export interface GradeValue { numericValue: number | null; conceptualValue: string | null; narrative: string | null; observation: string | null; atRisk?: boolean }

export interface ReportCard {
  student: { id: number; firstName: string; lastName: string; dni: string | null };
  division: { id: number; name: string };
  level: { id: number; name: string; type: LevelType; settings: LevelSettings };
  periods: Period[];
  rows: Array<{ subjectId: number; subject: string; grades: Record<number, GradeValue>; final: number | null; finalApproved: boolean | null }>;
}

export interface Paginated<T> { data: T[]; pagination: { totalItems: number; currentPage: number; totalPages: number } }

export interface Contact { userId: number; name: string; role: string; detail: string | null; avatar: string | null }

export interface AttachmentRef { name: string; url: string; size?: number; type?: string }

