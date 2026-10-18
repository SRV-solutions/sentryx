/** Validaciones (zod) de configuración académica y recorrido de los alumnos. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { GRADING_SCHEMES } from '../services/academicSetup';
import { LEAVE_REASONS } from '../models/school/people';

const dateRange = z.object({ startDate: z.string().date(), endDate: z.string().date() });

/** POST /structure/defaults — salas, grados y años por defecto para un colegio nuevo. */
export const createDefaultStructure = {
  body: z.object({
    primaryYears: z.union([z.literal(6), z.literal(7)]).default(6),
    secondaryYears: z.union([z.literal(5), z.literal(6)]).default(6),
    sections: z.array(z.string().trim().min(1).max(10)).max(6).default(['A']),
    shift: z.string().trim().max(30).default('Mañana'),
    createSubjects: z.boolean().default(true),
    levelIds: z.array(z.number().int()).optional(),
  }),
};

/** GET /periods/suggested-ranges */
export const suggestedRanges = { query: z.object({ scheme: z.enum(GRADING_SCHEMES), academicYearId: z.coerce.number().int().optional() }) };

/** POST /periods/scheme — trimestral o bimestral, con fechas, para los niveles elegidos (todos por defecto). */
export const applyGradingScheme = {
  body: z.object({
    scheme: z.enum(GRADING_SCHEMES),
    ranges: z.array(dateRange).min(3).max(4),
    levelIds: z.array(z.number().int()).optional(),
    academicYearId: z.number().int().optional(),
  }),
};

/** POST /years — ciclo lectivo nuevo (opcional: copiar los cursos y docentes del actual). */
export const createAcademicYear = {
  body: z.object({
    year: z.number().int().min(2020).max(2100),
    startDate: z.string().date(),
    endDate: z.string().date(),
    makeCurrent: z.boolean().default(false),
    copyDivisionsFromCurrent: z.boolean().default(true),
    copyAssignments: z.boolean().default(false),
  }),
};

/** POST /students/transfer — cambio de curso dentro del mismo ciclo. */
export const transferStudents = {
  body: z.object({ studentIds: z.array(z.number().int()).min(1).max(100), divisionId: z.number().int(), reason: z.string().trim().max(200).nullish() }),
};

/** POST /students/:id/withdraw — baja con motivo. */
export const withdrawStudent = {
  params: idParam,
  body: z.object({
    reason: z.enum(Object.keys(LEAVE_REASONS) as [keyof typeof LEAVE_REASONS, ...Array<keyof typeof LEAVE_REASONS>]),
    date: z.string().date(),
    notes: z.string().trim().max(1000).nullish(),
  }),
};

/** POST /students/:id/reactivate */
export const reactivateStudent = { params: idParam, body: z.object({ divisionId: z.number().int() }) };

/** GET /promotions/plan */
export const promotionPlan = { query: z.object({ targetYearId: z.coerce.number().int() }) };

/** POST /promotions — aplica la promoción y pasa al ciclo nuevo. */
export const applyPromotion = {
  body: z.object({
    targetYearId: z.number().int(),
    moves: z
      .array(z.object({ studentId: z.number().int(), outcome: z.enum(['PROMOTED', 'REPEATS', 'GRADUATED']), targetDivisionId: z.number().int().nullable() }))
      .min(1)
      .max(5000),
  }),
};
