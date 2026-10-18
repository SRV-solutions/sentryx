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
