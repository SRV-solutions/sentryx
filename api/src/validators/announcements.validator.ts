/** Validaciones (zod) de las rutas de announcements. */
import { z } from 'zod';
import { FileAsset } from '../models';
import { idParam, pagination } from '../lib/http';
import { AUDIENCE_TYPES } from '../constants/school';

/** Adjuntos: referencia a un FileAsset ya subido y confirmado (ver routes/files.ts). */
export const attachmentSchema = z.object({ fileId: z.number().int() });

export const announcementBody = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(20000),
  audience: z.object({ type: z.enum(AUDIENCE_TYPES), ids: z.array(z.number().int()).max(500).default([]), includeStaff: z.boolean().optional() }),
  requiresAck: z.boolean().default(false),
  priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
  attachments: z.array(attachmentSchema).max(10).default([]),
});

export const boxQuery = pagination.extend({ box: z.enum(['inbox', 'sent']).default('inbox'), unread: z.coerce.boolean().optional() });

export const newThreadBody = z.object({
  studentId: z.number().int(),
  recipientId: z.number().int(),
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(1).max(5000),
  attachments: z.array(attachmentSchema).max(5).default([]),
});

/** POST /announcements */
export const createAnnouncement = { body: announcementBody };

/** GET /announcements */
export const listAnnouncements = { query: boxQuery };

/** GET /announcements/:id */
export const getAnnouncement = { params: idParam };

/** POST /announcements/:id/ack */
export const acknowledge = { params: idParam };

/** GET /announcements/:id/recipients */
export const listRecipients = { params: idParam, query: z.object({ filter: z.enum(['all', 'unread', 'pending-ack']).default('all') }) };

/** POST /announcements/:id/remind */
export const remindPending = { params: idParam };
