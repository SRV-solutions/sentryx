/** Validaciones (zod) de las rutas de threads. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { attachmentSchema, newThreadBody } from './announcements.validator';

/** GET /threads/contacts */
export const listContacts = { query: z.object({ studentId: z.coerce.number().int() }) };

/** POST /threads */
export const createThread = { body: newThreadBody };

/** GET /threads/:id */
export const getThread = { params: idParam, query: z.object({ before: z.coerce.number().int().optional() }) };

/** POST /threads/:id/messages */
export const postMessage = { params: idParam, body: z.object({ body: z.string().trim().min(1).max(5000), attachments: z.array(attachmentSchema).max(5).default([]) }) };

/** POST /threads/:id/read */
export const markAsRead = { params: idParam };

/** POST /threads/:id/participants */
export const addParticipant = { params: idParam, body: z.object({ userId: z.number().int() }) };

/** POST /threads/:id/:action(close|reopen) */
export const setThreadStatus = { params: z.object({ id: z.coerce.number().int(), action: z.enum(['close', 'reopen']) }) };
