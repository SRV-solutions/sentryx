/** Validaciones (zod) de las rutas de announcements. */
import { z } from 'zod';
import { FileAsset } from '../models';
import { idParam, pagination } from '../lib/http';
import { AUDIENCE_TYPES, AUDIENCE_TARGETS, ANNOUNCEMENT_CATEGORIES, NON_STAFF_CATEGORIES } from '../constants/school';

/** Adjuntos: referencia a un FileAsset ya subido y confirmado (ver routes/files.ts). */
export const attachmentSchema = z.object({ fileId: z.number().int() });

// z.string().date() valida formato Y que la fecha exista (2020-13-99 no pasa).
const isoDate = z.string().date('Fecha inválida (AAAA-MM-DD)');

export const announcementBody = z
  .object({
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(1).max(20000),
    audience: z.object({
      type: z.enum(AUDIENCE_TYPES),
      ids: z.array(z.number().int()).max(3000).default([]),
      includeStaff: z.boolean().optional(),
      /** Alumnos/cursos/niveles/institución: a familias, a estudiantes con cuenta o a ambos. */
      target: z.enum(AUDIENCE_TARGETS).optional(),
      /** "Sumar más gente": personas puntuales del alcance además de la audiencia. */
      extraUserIds: z.array(z.number().int()).max(200).optional(),
    }),
    requiresAck: z.boolean().default(false),
    priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
    category: z.enum(ANNOUNCEMENT_CATEGORIES).default('INSTITUCIONAL'),
    allowReplies: z.boolean().default(false),
    attachments: z.array(attachmentSchema).max(10).default([]),
    /** send: sale ahora · draft: queda guardado · schedule: se envía solo en scheduledAt. */
    mode: z.enum(['send', 'draft', 'schedule']).default('send'),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'schedule') {
      if (!v.scheduledAt) ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Indicá cuándo enviarlo.' });
      else if (new Date(v.scheduledAt).getTime() < Date.now() + 60_000) ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'La fecha de envío tiene que ser futura.' });
    }
  });

/** Bandeja: búsqueda y filtros. `status` solo aplica a "Enviados" (lo del autor). */
export const boxQuery = pagination.extend({
  box: z.enum(['inbox', 'sent']).default('inbox'),
  unread: z.coerce.boolean().optional(),
  q: z.string().trim().max(120).optional(),
  priority: z.enum(['URGENT']).optional(),
  pendingAck: z.coerce.boolean().optional(),
  attachments: z.coerce.boolean().optional(),
  archived: z.coerce.boolean().optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'SENT', 'ARCHIVED']).optional(),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const newThreadBody = z.object({
  studentId: z.number().int(),
  recipientId: z.number().int(),
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(1).max(5000),
  attachments: z.array(attachmentSchema).max(5).default([]),
});

/** Comunicado de una familia o estudiante a sus contactos (docentes, preceptoría, conducción) sobre un alumno. */
export const personalBody = z.object({
  studentId: z.number().int(),
  recipientIds: z.array(z.number().int()).min(1, 'Elegí a quién le escribís.').max(30),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(20000),
  category: z
    .enum(ANNOUNCEMENT_CATEGORIES)
    .default('CONSULTA')
    .refine((c) => NON_STAFF_CATEGORIES.includes(c), 'Ese tipo de comunicado no está disponible.'),
  allowReplies: z.boolean().default(true),
  attachments: z.array(attachmentSchema).max(5).default([]),
});

/** Respuesta a un comunicado: abre (o sigue) la conversación privada con quien lo envió. */
export const replyBody = z.object({
  body: z.string().trim().min(1).max(5000),
  attachments: z.array(attachmentSchema).max(5).default([]),
});

/** POST /announcements/personal */
export const createPersonal = { body: personalBody };

/** POST /announcements/:id/reply */
export const reply = { params: idParam, body: replyBody };

/** GET /announcements/people — personas para la audiencia "Personas" y "Sumar más gente". */
export const searchPeople = {
  query: z.object({ q: z.string().trim().min(2, 'Escribí al menos 2 letras.').max(80), limit: z.coerce.number().int().min(1).max(50).default(20) }),
};

/** POST /announcements */
export const createAnnouncement = { body: announcementBody };

/** PUT /announcements/:id (borradores y programados) */
export const updateAnnouncement = { params: idParam, body: announcementBody };

/** GET /announcements */
export const listAnnouncements = { query: boxQuery };

/** GET /announcements/families — familias para elegir destinatarios (con filtros). */
export const listFamilies = {
  query: pagination.extend({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    q: z.string().trim().max(80).optional(),
    levelId: z.coerce.number().int().optional(),
    gradeYear: z.coerce.number().int().optional(),
    divisionId: z.coerce.number().int().optional(),
    /** true: solo los userId de todo el resultado filtrado (para "seleccionar todos"). */
    ids: z.coerce.boolean().optional(),
  }),
};

/** GET /announcements/:id */
export const getAnnouncement = { params: idParam };

/** POST /announcements/:id/ack */
export const acknowledge = { params: idParam };

/** POST /announcements/:id/send · /archive · /unarchive · DELETE /announcements/:id */
export const byId = { params: idParam };

/** GET /announcements/:id/recipients */
export const listRecipients = { params: idParam, query: z.object({ filter: z.enum(['all', 'unread', 'pending-ack']).default('all') }) };

/** POST /announcements/:id/remind */
export const remindPending = { params: idParam };
