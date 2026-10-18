/** Validaciones (zod) de las rutas de attendance. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { ATTENDANCE_STATUSES, ALERT_RULE_TYPES, SEVERITIES } from '../constants/school';

export const today = () => new Date().toISOString().slice(0, 10);

export const takeBody = z.object({
  date: z.string().date(),
  records: z
    .array(
      z.object({
        studentId: z.number().int(),
        status: z.enum(ATTENDANCE_STATUSES),
        justified: z.boolean().default(false),
        note: z.string().max(300).nullish(),
      })
    )
    .min(1)
    .max(80),
});

// ----- Reglas (la normativa se carga acá) -----
export const ruleBody = z
  .object({
    name: z.string().min(3).max(120),
    levelId: z.number().int().nullish(),
    type: z.enum(ALERT_RULE_TYPES),
    threshold: z.number().positive().max(1000),
    windowDays: z.number().int().min(1).max(365).nullish(),
    countJustified: z.boolean().default(true),
    severity: z.enum(SEVERITIES),
    notifyGuardians: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((r) => r.type !== 'WINDOW' || r.windowDays, { message: 'Indicá la cantidad de días de la ventana.', path: ['windowDays'] })
  .refine((r) => r.type !== 'PERCENT' || r.threshold <= 100, { message: 'El porcentaje debe ser ≤ 100.', path: ['threshold'] });

/** GET /attendance/division/:id */
export const getDivisionDay = { params: idParam, query: z.object({ date: z.string().date().default(today) }) };

/** PUT /attendance/division/:id */
export const saveDivisionDay = { params: idParam, body: takeBody };

/** PATCH /attendance/:id */
export const updateRecord = { params: idParam, body: z.object({ justified: z.boolean(), note: z.string().max(300).nullish() }) };

/** GET /attendance/student/:id */
export const getStudentAttendance = { params: idParam };

/** GET /attendance/summary/:id */
export const getDivisionSummary = { params: idParam };

/** GET /attendance/today */
export const getTodayOverview = { query: z.object({ date: z.string().date().default(today) }) };
