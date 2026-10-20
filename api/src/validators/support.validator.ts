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
    /** Claves devueltas por POST /support/attachments/presign (se verifican en el bucket al crear el reporte). */
    attachments: z.array(z.object({ key: z.string().max(400), name: z.string().trim().min(1).max(200), size: z.number().int().positive(), type: z.string().max(100) })).max(5).default([]),
  }),
};

/** Capturas (hasta 15 MB, se comprimen en el navegador) y videos de pantalla (hasta 200 MB). */
export const REPORT_IMAGE_MAX = 15 * 1024 * 1024;
export const REPORT_VIDEO_MAX = 200 * 1024 * 1024;
export const REPORT_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|webm|quicktime))$/;

/** POST /support/attachments/presign */
export const presignAttachment = {
  body: z
    .object({ fileName: z.string().trim().min(1).max(200), contentType: z.string().regex(REPORT_TYPES, 'Solo imágenes (JPG, PNG, WebP, GIF) o videos (MP4, WebM, MOV).'), size: z.number().int().positive() })
    .refine((v) => v.size <= (v.contentType.startsWith('video/') ? REPORT_VIDEO_MAX : REPORT_IMAGE_MAX), 'El archivo es demasiado pesado (imágenes hasta 15 MB, videos hasta 200 MB).'),
};

/** GET /platform/support-reports */
export const listReports = { query: pagination.extend({ status: z.enum(SUPPORT_REPORT_STATUSES).optional(), q: z.string().trim().max(80).optional() }) };

/** PATCH /platform/support-reports/:id */
export const updateReport = {
  params: idParam,
  body: z.object({ status: z.enum(SUPPORT_REPORT_STATUSES), response: z.string().trim().max(4000).nullish() }),
};
