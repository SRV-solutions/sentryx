/**
 * Planes por persona. Espejo de api/src/constants/plans.ts (los precios y lo que incluye cada uno los
 * manda la API en GET /school/plans/catalog; esto es para chequear funciones en la app).
 * Quien decide de verdad es la API: responde 402 si el plan no incluye la función.
 */
import { useSchool } from './SchoolContext';

export enum PlanFeature {
  EXTRA_STORAGE = 'extra_storage',
  PAYROLL = 'payroll',
  STAFF_RECORDS = 'staff_records',
  EVENTS = 'events',
  SUBJECT_PROGRAMS = 'subject_programs',
  QUIZZES = 'quizzes',
}

export type PlanCode = 'BASICO' | 'AMPLIADO' | 'PROFESIONAL' | 'INTEGRAL';
export const PLAN_CODES: PlanCode[] = ['BASICO', 'AMPLIADO', 'PROFESIONAL', 'INTEGRAL'];
export const PLAN_NAMES: Record<PlanCode, string> = { BASICO: 'Básico', AMPLIADO: 'Ampliado', PROFESIONAL: 'Profesional', INTEGRAL: 'Integral' };
export const PLAN_TONES: Record<PlanCode, 'info' | 'ok' | 'warn' | 'accent' | undefined> = { BASICO: undefined, AMPLIADO: 'info', PROFESIONAL: 'ok', INTEGRAL: 'accent' };

/** Plan mínimo que incluye cada función. */
export const FEATURE_MIN_PLAN: Record<PlanFeature, PlanCode> = {
  [PlanFeature.EXTRA_STORAGE]: 'AMPLIADO',
  [PlanFeature.PAYROLL]: 'PROFESIONAL',
  [PlanFeature.STAFF_RECORDS]: 'PROFESIONAL',
  [PlanFeature.EVENTS]: 'INTEGRAL',
  [PlanFeature.SUBJECT_PROGRAMS]: 'INTEGRAL',
  [PlanFeature.QUIZZES]: 'INTEGRAL',
};

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  [PlanFeature.EXTRA_STORAGE]: 'Espacio ampliado',
  [PlanFeature.PAYROLL]: 'Recibos de sueldo',
  [PlanFeature.STAFF_RECORDS]: 'Legajo docente (cargos, horas y turnos)',
  [PlanFeature.EVENTS]: 'Calendario de actos y eventos',
  [PlanFeature.SUBJECT_PROGRAMS]: 'Programas de las materias',
  [PlanFeature.QUIZZES]: 'Juegos de preguntas',
};

export interface PlanInfo {
  code: PlanCode;
  name: string;
  price: number;
  storageGb: number;
  forStaff: string[];
  forFamilies: string[];
  features: Array<{ feature: PlanFeature; label: string }>;
}

export const ars = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
export const formatBytesShort = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB` : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${Math.max(0, Math.round(bytes / 1024))} KB`;

/** Plan de la persona en el colegio activo. */
export const usePlan = () => {
  const { session } = useSchool();
  const features = new Set(session?.plan?.features ?? []);
  return {
    plan: session?.plan ?? null,
    hasFeature: (feature: PlanFeature) => features.has(feature),
  };
};

/** "1 GB" (o lo que configure el servidor): el máximo por archivo, para mostrarlo donde se sube. */
export const uploadLimitLabel = (maxUploadMb?: number) => {
  const mb = maxUploadMb ?? 1024;
  return mb >= 1024 ? `${(mb / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} GB` : `${mb} MB`;
};
