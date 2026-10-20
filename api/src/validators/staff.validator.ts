/** Validaciones (zod) de las rutas de staff. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { isStaffRole } from '../constants/roles';
import { person } from './person.validator';

export const staffBody = z.object({
  ...person,
  // Código del catálogo o de un rol personalizado del colegio (se valida contra el registro al otorgarlo).
  role: z.string().trim().min(2).max(40).refine((r) => isStaffRole(r as never), 'Las familias y estudiantes se cargan desde la ficha del alumno.'),
  levelId: z.number().int().nullish(),
  divisionIds: z.array(z.number().int()).default([]),
  title: z.string().max(80).nullish(),
});

/** Una fila de la importación masiva (CSV): el rol y el nivel llegan por nombre o código. */
export const staffImportRow = z.object({
  ...person,
  role: z.string().trim().min(2).max(40),
  level: z.string().trim().max(40).nullish(),
  title: z.string().trim().max(80).nullish(),
});

/** POST /staff/import */
export const importStaff = { body: z.object({ rows: z.array(z.unknown()).min(1).max(500), sendEmails: z.boolean().default(true) }) };

/** POST /staff */
export const createStaffMember = { body: staffBody };

/** PATCH /staff/:id */
export const updateStaffRole = {
    params: idParam,
    body: z.object({
      levelId: z.number().int().nullish(),
      divisionIds: z.array(z.number().int()).optional(),
      title: z.string().max(80).nullish(),
      active: z.boolean().optional(),
    }),
  };
