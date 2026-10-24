/** Validaciones (zod) de ausencias docentes y horario del aula. */
import { z } from 'zod';
import { idParam } from '../lib/http';

const date = z.string().date('usá el formato AAAA-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'usá el formato HH:MM');

/** GET /teacher-absences */
export const listAbsences = { query: z.object({ from: date.optional(), to: date.optional(), divisionId: z.coerce.number().int().positive().optional() }) };

/** POST /teacher-absences (sin teacherId = la propia) */
export const createAbsence = {
  body: z.object({
    teacherId: z.number().int().positive().optional(),
    date,
    endDate: date.nullish(),
    fromTime: time.nullish(),
    toTime: time.nullish(),
    note: z.string().trim().max(500).optional(),
    substitute: z.string().trim().max(120).nullish(),
    notify: z.boolean().default(true),
  }),
};

/** DELETE /teacher-absences/:id */
export const deleteAbsence = { params: idParam };

/** GET /classrooms/:id/timetable */
export const classroomTimetable = { params: idParam };
