/** Validaciones (zod) de las rutas de alerts. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { SEVERITIES } from '../constants/school';
import { ruleBody } from './attendance.validator';

/** GET /alerts */
export const listAlerts = {
    query: z.object({
      status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ACTIVE']).default('ACTIVE'),
      severity: z.enum(SEVERITIES).optional(),
      divisionId: z.coerce.number().int().optional(),
    }),
  };

/** PATCH /alerts/:id */
export const updateAlert = { params: idParam, body: z.object({ status: z.enum(['ACKNOWLEDGED', 'RESOLVED', 'OPEN']), note: z.string().max(500).nullish() }) };

/** POST /alerts/rules */
export const createRule = { body: ruleBody };

/** PATCH /alerts/rules/:id */
export const updateRule = { params: idParam, body: z.object({}).passthrough() };

/** DELETE /alerts/rules/:id */
export const deleteRule = { params: idParam };

/** GET /alerts/no-email */
export const listNoEmail = {
  query: z.object({
    divisionId: z.coerce.number().int().positive().optional(),
    /** missing: sin cuenta o sin email (por defecto) · present: con email real · all: todos */
    status: z.enum(['missing', 'present', 'all']).default('missing'),
  }),
};

/** POST /alerts/no-email/notify (sin studentIds: todos los de su alcance) */
export const notifyNoEmail = { body: z.object({ studentIds: z.array(z.number().int().positive()).min(1).max(2000).optional(), force: z.boolean().default(false) }) };

/** POST /alerts/student-emails/request-change */
export const requestEmailChange = {
  body: z.object({
    studentIds: z.array(z.number().int().positive()).min(1).max(500),
    reason: z.string().trim().max(300).nullish(),
  }),
};
