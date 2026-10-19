/**
 * PLANES (por persona)
 *
 * Cada persona del colegio (personal, familia o estudiante) tiene un plan. El plan define:
 *  - cuánto se cobra por esa persona por mes (services/billing.ts),
 *  - cuánto puede subir en archivos (services/files.ts),
 *  - qué funciones extra tiene (middlewares/requireFeature.ts).
 *
 * Los permisos (constants/permissions.ts) dicen QUÉ puede hacer según su rol; el plan dice si esa
 * función está CONTRATADA para esa persona. Hacen falta las dos cosas.
 * Cada plan incluye todo lo del anterior. Quien no tiene plan asignado está en el Básico.
 */
import { env } from '../config/env';

/** Funciones que se habilitan con planes superiores. */
export enum PlanFeature {
  /** Más espacio para subir archivos. */
  EXTRA_STORAGE = 'extra_storage',
  /** Recibos de sueldo: administración los sube y la persona los ve y firma la conformidad. */
  PAYROLL = 'payroll',
  /** Legajo del personal: cargos, horas, turnos y horario. */
  STAFF_RECORDS = 'staff_records',
  /** Calendario institucional: feriados, actos con encargados y su espacio de trabajo. */
  EVENTS = 'events',
  /** Programas de las materias con sus unidades (planes de aprendizaje). */
  SUBJECT_PROGRAMS = 'subject_programs',
  /** Juegos de preguntas (en vivo con PIN o como tarea), enlazados a las unidades del programa. */
  QUIZZES = 'quizzes',
}

export const PLAN_CODES = ['BASICO', 'AMPLIADO', 'PROFESIONAL', 'INTEGRAL'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export const DEFAULT_PLAN: PlanCode = 'BASICO';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  /** Precio mensual por persona, en pesos. */
  price: number;
  /** Espacio para archivos de la persona. */
  storageGb: number;
  /** Funciones que suma este plan (además de las de los anteriores). */
  adds: PlanFeature[];
  /** Qué incluye, en palabras, para el personal y para las familias. */
  forStaff: string[];
  forFamilies: string[];
}

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    code: 'BASICO',
    name: 'Básico',
    price: env.BILLING_PRICE_ARS,
    storageGb: 5,
    adds: [],
    forStaff: ['Comunicados, boletines y notas', 'Asistencia y alertas', 'Chats con familias y alumnos, canales y aulas', '5 GB para archivos'],
    forFamilies: ['Comunicados, boletín y asistencia de sus hijos', 'Mensajes con la escuela'],
  },
  {
    code: 'AMPLIADO',
    name: 'Ampliado',
    price: 720,
    storageGb: 15,
    adds: [PlanFeature.EXTRA_STORAGE],
    forStaff: ['Todo lo del Básico', '15 GB para archivos (en lugar de 5 GB)'],
    forFamilies: ['Todo lo del Básico', 'Más espacio para adjuntos'],
  },
  {
    code: 'PROFESIONAL',
    name: 'Profesional',
    price: 2150,
    storageGb: 30,
    adds: [PlanFeature.PAYROLL, PlanFeature.STAFF_RECORDS],
    forStaff: ['Todo lo del Ampliado', '30 GB para archivos', 'Recibos de sueldo digitales con conformidad', 'Legajo docente: cargos, horas, turnos y horario'],
    forFamilies: ['Todo lo del Ampliado', '30 GB para archivos'],
  },
  {
    code: 'INTEGRAL',
    name: 'Integral',
    price: 3000,
    storageGb: 50,
    adds: [PlanFeature.EVENTS, PlanFeature.SUBJECT_PROGRAMS, PlanFeature.QUIZZES],
    forStaff: [
      'Todo lo del Profesional',
      '50 GB para archivos',
      'Calendario de actos y eventos con feriados nacionales',
      'Encargados de actos con su espacio de trabajo',
      'Programas de las materias por unidades',
      'Juegos de preguntas en vivo o como tarea',
    ],
    forFamilies: ['Todo lo del Profesional', '50 GB para archivos', 'Calendario de actos y eventos', 'Programas de las materias de sus hijos', 'Resultados de los juegos de sus hijos'],
  },
];

export const planDefinition = (code: PlanCode) => PLAN_CATALOG.find((p) => p.code === code)!;
export const planRank = (code: PlanCode) => PLAN_CODES.indexOf(code);
export const planPrice = (code: PlanCode) => planDefinition(code).price;

/** Funciones de un plan: las suyas y las de todos los planes anteriores. */
export const featuresOf = (code: PlanCode): Set<PlanFeature> =>
  new Set(PLAN_CATALOG.filter((p) => planRank(p.code) <= planRank(code)).flatMap((p) => p.adds));

/** El plan más barato que incluye esa función. */
export const minimumPlanFor = (feature: PlanFeature) => PLAN_CATALOG.find((p) => featuresOf(p.code).has(feature))!;

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  [PlanFeature.EXTRA_STORAGE]: 'Espacio ampliado',
  [PlanFeature.PAYROLL]: 'Recibos de sueldo',
  [PlanFeature.STAFF_RECORDS]: 'Legajo docente (cargos, horas y turnos)',
  [PlanFeature.EVENTS]: 'Calendario de actos y eventos',
  [PlanFeature.SUBJECT_PROGRAMS]: 'Programas de las materias',
  [PlanFeature.QUIZZES]: 'Juegos de preguntas',
};
