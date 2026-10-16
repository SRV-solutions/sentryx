/** Dominio escolar: enums y reglas por defecto. Compartido conceptualmente con el cliente (client/src/school/types.ts). */

export const LEVEL_TYPES = ['INICIAL', 'PRIMARIO', 'SECUNDARIO'] as const;
export type LevelType = (typeof LEVEL_TYPES)[number];

export const SCHOOL_ROLES = [
  'REPRESENTANTE_LEGAL',
  'DIRECTOR',
  'VICEDIRECTOR',
  'RECTOR',
  'SECRETARIO',
  'PRECEPTOR',
  'ADMINISTRACION',
  'DOCENTE',
  'TUTOR',
] as const;
export type SchoolRole = (typeof SCHOOL_ROLES)[number];

export const ROLE_LABELS: Record<SchoolRole, string> = {
  REPRESENTANTE_LEGAL: 'Representante Legal',
  DIRECTOR: 'Dirección',
  VICEDIRECTOR: 'Vicedirección',
  RECTOR: 'Rectoría',
  SECRETARIO: 'Secretaría',
  PRECEPTOR: 'Preceptoría',
  ADMINISTRACION: 'Administración',
  DOCENTE: 'Docente',
  TUTOR: 'Familia',
};

/** Roles de conducción: reciben mensajes de familias de su nivel. */
export const LEADERSHIP_ROLES: SchoolRole[] = ['DIRECTOR', 'VICEDIRECTOR', 'RECTOR'];
export const STAFF_ROLES: SchoolRole[] = SCHOOL_ROLES.filter((r) => r !== 'TUTOR');

export const PERIOD_KINDS = ['CONCEPTUAL', 'NUMERIC', 'NARRATIVE'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const ATTENDANCE_STATUSES = ['PRESENTE', 'AUSENTE', 'TARDE', 'RETIRO'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ALERT_RULE_TYPES = ['TOTAL', 'CONSECUTIVE', 'PERCENT', 'WINDOW'] as const;
export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];

export const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const AUDIENCE_TYPES = ['SCHOOL', 'LEVEL', 'DIVISION', 'STUDENTS', 'STAFF'] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export interface LevelSettings {
  conceptualScale: string[];
  numericMin: number;
  numericMax: number;
  passingGrade: number;
  /** Valor de cada tipo de inasistencia en faltas. */
  attendanceWeights: Record<Exclude<AttendanceStatus, 'PRESENTE'>, number>;
}

export const DEFAULT_LEVEL_SETTINGS: Record<LevelType, LevelSettings> = {
  INICIAL: {
    conceptualScale: ['Logrado', 'En proceso', 'Con dificultad'],
    numericMin: 1,
    numericMax: 10,
    passingGrade: 6,
    attendanceWeights: { AUSENTE: 1, TARDE: 0.5, RETIRO: 0.5 },
  },
  PRIMARIO: {
    conceptualScale: ['Sobresaliente', 'Muy Bueno', 'Bueno', 'Regular', 'Insuficiente'],
    numericMin: 1,
    numericMax: 10,
    passingGrade: 6,
    attendanceWeights: { AUSENTE: 1, TARDE: 0.5, RETIRO: 0.5 },
  },
  SECUNDARIO: {
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
