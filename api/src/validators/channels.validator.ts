/** Validaciones (zod) de las rutas de channels. */
import { z } from 'zod';
import { idParam } from '../lib/http';

export const messageBody = z.object({ body: z.string().trim().min(1).max(2000), attachments: z.array(z.object({ fileId: z.number().int() })).max(5).default([]) });

/** GET /channels/:id */
export const getChannel = { params: idParam, query: z.object({ before: z.coerce.number().int().optional() }) };

/** GET /channels/:id/members */
export const listMembers = { params: idParam };

/** POST /channels/:id/messages */
export const postMessage = { params: idParam, body: messageBody };

/** POST /channels/:id/read */
export const markAsRead = { params: idParam };

/** POST /channel-messages/:id/:action(hide|unhide) */
export const setMessageVisibility = { params: z.object({ id: z.coerce.number().int(), action: z.enum(['hide', 'unhide']) }) };

/** POST /channels/:id/mute */
export const muteStudent = { params: idParam, body: z.object({ userId: z.number().int(), hours: z.number().int().min(1).max(168), reason: z.string().trim().max(200).nullish() }) };

/** DELETE /channels/:id/mute/:userId */
export const unmuteStudent = { params: z.object({ id: z.coerce.number().int(), userId: z.coerce.number().int() }) };
