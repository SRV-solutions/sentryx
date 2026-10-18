/** Validaciones (zod) de las rutas de billing. */
import { z } from 'zod';

export const cycleQuery = z.object({ cycle: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'usá el formato AAAA-MM').optional() });

/** GET /billing */
export const getSchoolBilling = { query: cycleQuery };
