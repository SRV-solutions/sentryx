/** Validaciones (zod) del calendario institucional. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { EVENT_KINDS, EVENT_AUDIENCES, EVENT_POST_KINDS } from '../models/school/events';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'usá el formato HH:MM');

const eventBody = z.object({
  title: z.string().trim().min(2).max(160),
  kind: z.enum(EVENT_KINDS).default('EVENTO'),
  date: z.string().date(),
  endDate: z.string().date().nullish(),
  startTime: time.nullish(),
  endTime: time.nullish(),
  location: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(5000).default(''),
  levelIds: z.array(z.number().int().positive()).max(10).default([]),
  divisionIds: z.array(z.number().int().positive()).max(200).default([]),
  audience: z.enum(EVENT_AUDIENCES).default('COMMUNITY'),
});

/** GET /events */
export const listEvents = { query: z.object({ from: z.string().date().optional(), to: z.string().date().optional() }) };
/** POST /events */
export const createEvent = { body: eventBody.refine((b) => !b.endDate || b.endDate >= b.date, { message: 'la fecha de fin no puede ser anterior al inicio', path: ['endDate'] }) };
/** PATCH /events/:id */
export const updateEvent = { params: idParam, body: eventBody.partial().extend({ cancelled: z.boolean().optional() }) };
export const eventId = { params: idParam };

/** PUT /events/:id/managers */
export const setManagers = {
  params: idParam,
  body: z.object({ managers: z.array(z.object({ userId: z.number().int().positive(), task: z.string().trim().max(120).nullish() })).max(30) }),
};

/** GET /events/holidays */
export const listHolidays = { query: z.object({ year: z.coerce.number().int().min(2020).max(2100) }) };

/** POST /events/holidays — importa los feriados y actos elegidos. */
export const importHolidays = {
  body: z.object({
    year: z.number().int().min(2020).max(2100),
    items: z
      .array(z.object({ key: z.string().max(40), holiday: z.boolean().default(true), act: z.boolean().default(false), actDate: z.string().date().nullish() }))
      .min(1)
      .max(40),
  }),
};

/** POST /events/:id/posts */
export const createPost = {
  params: idParam,
  body: z
    .object({
      kind: z.enum(EVENT_POST_KINDS),
      body: z.string().trim().max(5000).default(''),
      url: z.string().trim().url().max(500).nullish(),
      fileIds: z.array(z.number().int().positive()).max(10).default([]),
      assigneeId: z.number().int().positive().nullish(),
      dueDate: z.string().date().nullish(),
    })
    .refine((b) => b.body || b.url || b.fileIds.length, { message: 'escribí algo, pegá un link o adjuntá un archivo' }),
};

/** PATCH /event-posts/:id */
export const updatePost = {
  params: idParam,
  body: z.object({ body: z.string().trim().max(5000).optional(), done: z.boolean().optional(), assigneeId: z.number().int().positive().nullish(), dueDate: z.string().date().nullish() }),
};
export const postId = { params: idParam };
