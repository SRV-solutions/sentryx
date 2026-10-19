/** Validaciones (zod) de planes. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { PLAN_CODES } from '../constants/plans';
import { CATEGORIES } from '../constants/roles';
import { PLAN_REQUEST_STATUSES } from '../models/school/plans';

/** GET /plans/members */
export const listMembers = {
  query: z.object({
    category: z.enum(CATEGORIES).optional(),
    plan: z.enum(PLAN_CODES).optional(),
    q: z.string().trim().max(80).optional(),
  }),
};

/** PUT /plans/members — cambia el plan de una o varias personas. */
export const changeMembersPlan = {
  body: z.object({ userIds: z.array(z.number().int().positive()).min(1).max(2000), plan: z.enum(PLAN_CODES) }),
};

/** POST /plans/requests — una persona pide subir de plan. */
export const createRequest = { body: z.object({ plan: z.enum(PLAN_CODES), note: z.string().trim().max(500).nullish() }) };

/** GET /plans/requests */
export const listRequests = { query: z.object({ status: z.enum(PLAN_REQUEST_STATUSES).optional() }) };

/** POST /plans/requests/:id/resolve */
export const resolveRequest = { params: idParam, body: z.object({ approve: z.boolean() }) };
