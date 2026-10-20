/** Validaciones (zod) de las rutas de grades. */
import { z } from 'zod';
import { idParam } from '../lib/http';

export const sheetQuery = z.object({ divisionId: z.coerce.number().int(), subjectId: z.coerce.number().int() });

export const saveBody = z.object({
  divisionId: z.number().int(),
  subjectId: z.number().int(),
  periodId: z.number().int(),
  entries: z
    .array(
      z.object({
        studentId: z.number().int(),
        numericValue: z.number().nullish(),
        conceptualValue: z.string().max(40).nullish(),
        narrative: z.string().max(5000).nullish(),
        observation: z.string().max(500).nullish(),
      })
    )
    .min(1)
    .max(80),
});

/** GET /sheet */
export const getGradeSheet = { query: sheetQuery };

/** PUT /sheet */
export const saveGradeSheet = { body: saveBody };

/** GET /report-card/:id */
export const getReportCard = { params: idParam, query: z.object({ yearId: z.coerce.number().int().optional() }) };

/** GET /division-status/:id */
export const getDivisionStatus = { params: idParam };

/** POST /publish */
export const publishReportCards = { body: z.object({ divisionId: z.number().int(), periodId: z.number().int(), notifyFamilies: z.boolean().default(true) }) };

/** DELETE /publish */
export const unpublishReportCards = { body: z.object({ divisionId: z.number().int(), periodId: z.number().int() }) };
