/** Validaciones (zod) de las rutas de files. */
import { z } from 'zod';
import { FILE_PURPOSES } from '../models/school/classroom';
import { idParam, pagination } from '../lib/http';

/** Mis archivos (docente) o todos (administración), con filtros. */
export const listQuery = pagination.extend({
  scope: z.enum(['mine', 'school']).default('mine'),
  divisionId: z.coerce.number().int().optional(),
  uploaderId: z.coerce.number().int().optional(),
  q: z.string().trim().max(60).optional(),
});

/** POST /files/presign */
export const createUploadUrl = {
    body: z.object({
      fileName: z.string().trim().min(1).max(200),
      contentType: z.string().max(120),
      size: z.number().int().positive(),
      purpose: z.enum(FILE_PURPOSES).default('OTHER'),
      divisionId: z.number().int().nullish(),
      subjectId: z.number().int().nullish(),
    }),
  };

/** POST /files/:id/confirm */
export const confirmUploadedFile = { params: idParam };

/** GET /files */
export const listFiles = { query: listQuery };

/** GET /files/:id */
export const getDownloadUrl = { params: idParam };

/** DELETE /files/:id */
export const deleteFileById = { params: idParam };
