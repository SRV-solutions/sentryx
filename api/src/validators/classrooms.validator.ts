/** Validaciones (zod) de las rutas de classrooms. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { POST_KINDS } from '../models/school/classroom';

export const postBody = z.object({
  kind: z.enum(POST_KINDS).default('MATERIAL'),
  subjectId: z.number().int().nullish(),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().max(20000).default(''),
  links: z.array(z.object({ url: z.string().url().max(1000), title: z.string().max(160).optional() })).max(10).default([]),
  fileIds: z.array(z.number().int()).max(15).default([]),
  dueDate: z.string().date().nullish(),
  pinned: z.boolean().default(false),
  notifyFamilies: z.boolean().default(true),
});

/** GET /classrooms/agenda — próximas evaluaciones, TP y tareas del alcance. */
export const agenda = { query: z.object({ days: z.coerce.number().int().min(1).max(120).default(30), divisionId: z.coerce.number().int().optional() }) };

/** GET /classrooms/:id */
export const getClassroom = { params: idParam };

/** GET /classrooms/:id/posts */
export const listPosts = {
    params: idParam,
    query: z.object({ subjectId: z.coerce.number().int().optional(), kind: z.enum(POST_KINDS).optional(), before: z.coerce.number().int().optional() }),
  };

/** POST /classrooms/:id/posts */
export const createPost = { params: idParam, body: postBody };

/** PATCH /classroom-posts/:id */
export const updatePost = { params: idParam, body: postBody.omit({ notifyFamilies: true }).partial() };

/** DELETE /classroom-posts/:id */
export const deletePost = { params: idParam };

/** GET /classrooms/:id/announcements */
export const listClassroomAnnouncements = { params: idParam, query: z.object({ page: z.coerce.number().int().min(1).default(1) }) };
