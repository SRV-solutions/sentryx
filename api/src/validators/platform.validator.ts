/** Validaciones (zod) de las rutas de platform. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { LEVEL_TYPES } from '../constants/school';

/** POST /platform/superadmins */
export const createSuperadmin = { body: z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().trim().email().max(120), dni: z.string().trim().max(12).nullish() }) };

export const schoolBody = z.object({
  name: z.string().trim().min(3).max(160),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,80}$/, 'solo minúsculas, números y guiones (ej: divina-providencia)'),
  cue: z.string().trim().max(20).nullish(),
  levels: z.array(z.enum(LEVEL_TYPES)).min(1, 'elegí al menos un nivel'),
  year: z.number().int().min(2020).max(2100),
  admin: z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(120),
    dni: z.string().trim().regex(/^[\d.\s]{6,12}$/, 'debe tener solo números').nullish(),
  }),
});

/** POST /schools */
export const registerSchool = { body: schoolBody };

/** PATCH /schools/:id */
export const updateSchool = { params: idParam, body: z.object({ name: z.string().trim().min(3).max(160).optional(), active: z.boolean().optional() }) };

/** GET /schools/:id/deletion — lo que se borraría. */
export const deletionSummary = { params: idParam };
/** DELETE /schools/:id — eliminación definitiva; hay que escribir el identificador del colegio. */
export const deleteSchool = { params: idParam, body: z.object({ confirm: z.string().trim().min(1, 'escribí el identificador del colegio').max(80) }) };

/** GET /billing */
export const getPlatformBilling = { query: z.object({ cycle: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }) };
