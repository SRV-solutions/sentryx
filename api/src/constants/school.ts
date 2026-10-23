/** Dominio escolar: enums y reglas por defecto. Compartido conceptualmente con el cliente (client/src/school/types.ts). */

export const LEVEL_TYPES = ['INICIAL', 'PRIMARIO', 'SECUNDARIO'] as const;
export type LevelType = (typeof LEVEL_TYPES)[number];

// Roles, categorías y permisos: catálogo único en roles.ts.
export {
  SCHOOL_ROLES,
  ROLE_LABELS,
  ROLE_CATEGORY,
  CATEGORIES,
  CATEGORY_LABELS,
  NON_STAFF_ROLES,
  STAFF_ROLES,
  LEADERSHIP_ROLES,
  isStaffRole,
  categoryOf,
} from './roles';
export type { SchoolRole, Category } from './roles';

export const PERIOD_KINDS = ['CONCEPTUAL', 'NUMERIC', 'NARRATIVE'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const ATTENDANCE_STATUSES = ['PRESENTE', 'AUSENTE', 'TARDE', 'RETIRO'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ALERT_RULE_TYPES = ['TOTAL', 'CONSECUTIVE', 'PERCENT', 'WINDOW'] as const;
export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];

export const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** GUARDIANS: familias elegidas una por una (ids = userId de cada madre/padre/tutor). */
export const AUDIENCE_TYPES = ['SCHOOL', 'LEVEL', 'DIVISION', 'STUDENTS', 'GUARDIANS', 'STAFF'] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

/**
 * Modo de calificación por defecto del nivel (lo define la conducción del nivel; cada período se puede cambiar igual):
 * NUMERIC solo números · CONCEPTUAL solo letras/escala · NARRATIVE informes · MIXED el esquema clásico de Secundario
 * (bimestre impar conceptual, par numérico).
 */
export const GRADING_MODES = ['NUMERIC', 'CONCEPTUAL', 'NARRATIVE', 'MIXED'] as const;
export type GradingMode = (typeof GRADING_MODES)[number];
export const DEFAULT_GRADING_MODE: Record<LevelType, GradingMode> = { INICIAL: 'NARRATIVE', PRIMARIO: 'CONCEPTUAL', SECUNDARIO: 'MIXED' };
export const gradingModeOf = (level: { type: LevelType; settings: { gradingMode?: GradingMode | null } }): GradingMode => level.settings?.gradingMode ?? DEFAULT_GRADING_MODE[level.type];
/** Tipo de nota de cada período según el modo (MIXED alterna conceptual/numérico; con cantidad impar, todo numérico). */
export const kindsForMode = (mode: GradingMode, count: number): PeriodKind[] =>
  Array.from({ length: count }, (_, i) => (mode === 'MIXED' ? (count % 2 === 0 ? (i % 2 === 0 ? 'CONCEPTUAL' : 'NUMERIC') : 'NUMERIC') : mode));

export interface LevelSettings {
  /** Si falta, se usa DEFAULT_GRADING_MODE según el tipo de nivel. */
  gradingMode?: GradingMode;
  conceptualScale: string[];
  numericMin: number;
  numericMax: number;
  passingGrade: number;
  /** Valor de cada tipo de inasistencia en faltas. */
  attendanceWeights: Record<Exclude<AttendanceStatus, 'PRESENTE'>, number>;
  /** Horario del nivel: entrada, duración del módulo y recreos (Administración → Horarios). */
  timetable?: { start?: string; moduleMinutes: number; breaks: Array<{ from: string; minutes: number; shift?: string | null; label?: string }> };
}

export const DEFAULT_LEVEL_SETTINGS: Record<LevelType, LevelSettings> = {
  INICIAL: {
    gradingMode: 'NARRATIVE',
    conceptualScale: ['Logrado', 'En proceso', 'Con dificultad'],
    numericMin: 1,
    numericMax: 10,
    passingGrade: 6,
    attendanceWeights: { AUSENTE: 1, TARDE: 0.5, RETIRO: 0.5 },
  },
  PRIMARIO: {
    gradingMode: 'CONCEPTUAL',
    conceptualScale: ['Sobresaliente', 'Muy Bueno', 'Bueno', 'Regular', 'Insuficiente'],
    numericMin: 1,
    numericMax: 10,
    passingGrade: 6,
    attendanceWeights: { AUSENTE: 1, TARDE: 0.5, RETIRO: 0.5 },
  },
  SECUNDARIO: {
    gradingMode: 'MIXED',
    conceptualScale: ['Avanzado', 'Suficiente', 'En proceso', 'Insuficiente'],
    numericMin: 1,
    numericMax: 10,
    passingGrade: 6,
    attendanceWeights: { AUSENTE: 1, TARDE: 0.25, RETIRO: 0.5 },
  },
};

export interface PeriodTemplate {
  name: string;
  groupName: string | null;
  kind: PeriodKind;
}

/**
 * Esquema de calificación por defecto de cada nivel (editable después desde administración).
 * Secundario: 2 cuatrimestres × 2 bimestres; el 1º bimestre de cada cuatrimestre es conceptual y el 2º numérico.
 */
export const DEFAULT_PERIODS: Record<LevelType, PeriodTemplate[]> = {
  INICIAL: [
    { name: '1º Informe', groupName: null, kind: 'NARRATIVE' },
    { name: '2º Informe', groupName: null, kind: 'NARRATIVE' },
  ],
  PRIMARIO: [
    { name: '1º Trimestre', groupName: null, kind: 'CONCEPTUAL' },
    { name: '2º Trimestre', groupName: null, kind: 'CONCEPTUAL' },
    { name: '3º Trimestre', groupName: null, kind: 'CONCEPTUAL' },
  ],
  SECUNDARIO: [
    { name: '1º Bimestre', groupName: '1º Cuatrimestre', kind: 'CONCEPTUAL' },
    { name: '2º Bimestre', groupName: '1º Cuatrimestre', kind: 'NUMERIC' },
    { name: '3º Bimestre', groupName: '2º Cuatrimestre', kind: 'CONCEPTUAL' },
    { name: '4º Bimestre', groupName: '2º Cuatrimestre', kind: 'NUMERIC' },
  ],
};
