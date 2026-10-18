/** Validaciones (zod) de las rutas de structure. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { LEVEL_TYPES, PERIOD_KINDS } from '../constants/school';

// ----- Divisiones -----
export const divisionBody = z.object({
  levelId: z.number().int().positive(),
  name: z.string().min(1).max(60),
  gradeYear: z.number().int().min(0).max(7),
  section: z.string().max(20).nullish(),
  shift: z.string().max(30).nullish(),
});

// ----- Materias -----
export const subjectBody = z.object({
  levelId: z.number().int().positive(),
  name: z.string().min(2).max(100),
  code: z.string().max(20).nullish(),
  gradeYear: z.number().int().min(0).max(7).nullish(),
});

/** PATCH /levels/:id */
export const updateLevel = {
    params: idParam,
    body: z.object({
      name: z.string().min(2).max(60).optional(),
      settings: z
        .object({
          conceptualScale: z.array(z.string().min(1).max(40)).min(2).max(10),
          numericMin: z.number().min(0).max(10),
          numericMax: z.number().min(1).max(100),
          passingGrade: z.number().min(0).max(100),
          attendanceWeights: z.object({ AUSENTE: z.number().min(0).max(1), TARDE: z.number().min(0).max(1), RETIRO: z.number().min(0).max(1) }),
        })
        .optional(),
    }),
  };

/** POST /levels */
export const createLevel = { body: z.object({ type: z.enum(LEVEL_TYPES) }) };


/** POST /years/:id/current */
export const setCurrentYear = { params: idParam };

/** POST /divisions */
export const createDivision = { body: divisionBody };

/** PATCH /divisions/:id */
export const updateDivision = { params: idParam, body: divisionBody.partial() };

/** DELETE /divisions/:id */
export const deleteDivision = { params: idParam };

/** POST /subjects */
export const createSubject = { body: subjectBody };

/** PATCH /subjects/:id */
export const updateSubject = { params: idParam, body: subjectBody.partial().extend({ active: z.boolean().optional() }) };

/** POST /assignments */
export const assignTeacher = { body: z.object({ divisionId: z.number().int(), subjectId: z.number().int(), teacherId: z.number().int() }) };

/** DELETE /assignments/:id */
export const removeAssignment = { params: idParam };

/** PATCH /periods/:id */
export const updatePeriod = {
    params: idParam,
    body: z.object({
      name: z.string().min(2).max(60).optional(),
      groupName: z.string().max(60).nullish(),
      kind: z.enum(PERIOD_KINDS).optional(),
      startDate: z.string().date().nullish(),
      endDate: z.string().date().nullish(),
    }),
  };

/** POST /periods/:id/:action(close|reopen) */
export const setPeriodStatus = { params: z.object({ id: z.coerce.number().int(), action: z.enum(['close', 'reopen']) }) };
