/** Validaciones (zod) de la consulta de auditoría. */
import { z } from 'zod';
import { pagination } from '../lib/http';

const filters = pagination.extend({
  userId: z.coerce.number().int().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  ip: z.string().trim().max(64).optional(),
  q: z.string().trim().max(80).optional(),
});

/** GET /school/audit/activity y /platform/activity */
export const listActivity = { query: filters.extend({ schoolId: z.coerce.number().int().optional() }) };

/** GET /school/audit/changes */
export const listChanges = { query: filters.extend({ entity: z.string().trim().max(40).optional(), action: z.string().trim().max(40).optional() }) };
