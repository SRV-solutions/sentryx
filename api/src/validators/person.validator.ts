/** Campos de una persona (alta de personal, familiares y edición de datos). */
import { z } from 'zod';

/** Campos vacíos del formulario ("") se toman como "sin dato" en lugar de fallar la validación. */
export const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const person = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.preprocess(blankToNull, z.string().trim().email().max(120).nullish()),
  dni: z.preprocess(blankToNull, z.string().trim().regex(/^[\d.\s]{6,12}$/, 'debe tener solo números (7 u 8 dígitos)').nullish()),
  phone: z.preprocess(blankToNull, z.string().trim().max(40).nullish()),
};
