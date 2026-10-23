/** Validaciones (zod) de las rutas de students. */
import { z } from 'zod';
import { idParam, pagination } from '../lib/http';
import { person } from './person.validator';

// =============== ALUMNOS ===============

export const studentQuery = pagination.extend({
  divisionId: z.coerce.number().int().optional(),
  q: z.string().trim().max(60).optional(),
  /** inactive: alumnos dados de baja (para consultar su legajo o reincorporarlos). */
  status: z.enum(['active', 'inactive']).default('active'),
});

export const guardianInput = z.object({
  ...person,
  relationship: z.string().trim().min(2).max(40).default('Tutor/a'),
  isPrimary: z.boolean().default(false),
  canPickUp: z.boolean().default(true),
  receivesCommunications: z.boolean().default(true),
}).refine((g) => !!(g.dni || g.email), { message: 'cargá el DNI o el email (lo usa para ingresar)', path: ['dni'] });

export const studentBody = z.object({
  firstName: person.firstName,
  lastName: person.lastName,
  dni: person.dni,
  birthDate: z.string().date().nullish(),
  notes: z.string().max(2000).nullish(),
  divisionId: z.number().int().positive(),
  guardians: z.array(guardianInput).max(6, 'admite hasta 6 familiares').default([]),
});

export type StudentInput = z.infer<typeof studentBody>;

/** GET /students */
export const listStudents = { query: studentQuery };

/** GET /students/:id */
export const getStudent = { params: idParam };

/** POST /students */
export const createStudent = { body: studentBody.extend({ sendEmail: z.boolean().default(true) }) };

/** POST /students/import */
export const importStudents = { body: z.object({ rows: z.array(z.unknown()).min(1).max(1500), sendEmails: z.boolean().default(true) }) };

/** PATCH /students/:id */
export const updateStudent = {
    params: idParam,
    body: studentBody.omit({ guardians: true }).partial().extend({ active: z.boolean().optional() }),
  };

/** POST /students/:id/guardians */
export const addGuardian = { params: idParam, body: guardianInput.and(z.object({ sendEmail: z.boolean().default(true) })) };

/** PATCH /guardians/:id */
export const updateGuardianLink = {
    params: idParam,
    body: z.object({
      relationship: z.string().max(40).optional(),
      isPrimary: z.boolean().optional(),
      canPickUp: z.boolean().optional(),
      receivesCommunications: z.boolean().optional(),
    }),
  };

/** DELETE /guardians/:id */
export const unlinkGuardian = { params: idParam };

/** POST /students/:id/account */
export const createAccount = { params: idParam, body: z.object({ email: person.email }) };

/** POST /students/accounts */
export const createDivisionAccounts = { body: z.object({ divisionId: z.number().int() }) };

/** PATCH /students/:id/account */
export const setAccountStatus = { params: idParam, body: z.object({ active: z.boolean() }) };
