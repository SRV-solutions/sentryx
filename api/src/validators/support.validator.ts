/** Validaciones (zod) de reportes de problemas. */
import { z } from 'zod';
import { idParam, pagination } from '../lib/http';
import { SUPPORT_REPORT_CATEGORIES, SUPPORT_REPORT_STATUSES } from '../models/school/system';

/** POST /support/reports — cualquier usuario con sesión. */
export const createReport = {
  body: z.object({
    category: z.enum(SUPPORT_REPORT_CATEGORIES).default('ERROR'),
    description: z.string().trim().min(10, 'contá un poco más qué pasó (mínimo 10 caracteres)').max(4000),
    pageUrl: z.string().trim().max(500).nullish(),
    appVersion: z.string().trim().max(40).nullish(),
    clientErrors: z
      .array(z.object({ message: z.string().max(500), source: z.string().max(300).nullish(), at: z.string().max(40).nullish() }))
      .max(10)
      .default([]),
  }),
};

/** GET /platform/support-reports */
export const listReports = { query: pagination.extend({ status: z.enum(SUPPORT_REPORT_STATUSES).optional(), q: z.string().trim().max(80).optional() }) };

/** PATCH /platform/support-reports/:id */
export const updateReport = {
  params: idParam,
  body: z.object({ status: z.enum(SUPPORT_REPORT_STATUSES), response: z.string().trim().max(4000).nullish() }),
};
