/** Validaciones (zod) de las rutas de people. */
import { z } from 'zod';
import { idParam, pagination } from '../lib/http';
import { person } from './person.validator';

export const dirQuery = pagination.extend({
  type: z.enum(['families', 'staff']).default('families'),
  q: z.string().trim().max(60).optional(),
  divisionId: z.coerce.number().int().optional(),
  role: z.string().max(30).optional(),
  status: z.enum(['all', 'never', 'pending']).default('all'),
});

/** GET /people */
export const listPeople = { query: dirQuery };

/** GET /people/:id */
export const getPerson = { params: idParam };

/** PATCH /people/:id */
export const updatePerson = { params: idParam, body: z.object(person).partial() };

/** POST /people/:id/reset-password */
export const resetPassword = { params: idParam };

/** PATCH /people/:id/access */
export const setAccess = { params: idParam, body: z.object({ active: z.boolean() }) };
