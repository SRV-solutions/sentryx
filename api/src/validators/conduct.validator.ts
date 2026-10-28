/** Validaciones (zod) de las rutas de convivencia. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { CONDUCT_KINDS, CONDUCT_KINDS_WITH_QUANTITY } from '../constants/school';

/** Misma convención de fecha que el resto de la API (UTC): va por delante de Argentina, así "hoy" nunca se rechaza. */
const todayIso = () => new Date().toISOString().slice(0, 10);

export const conductBody = z
  .object({
    occurredOn: z.string().date().refine((d) => d <= todayIso(), 'no puede ser una fecha futura'),
    kind: z.enum(CONDUCT_KINDS),
    // En una rectificación es la cantidad corregida del original (0 = la sanción queda sin efecto).
    quantity: z.number().int().min(0).max(99).nullish(),
    subjectId: z.number().int().positive().nullish(),
    description: z.string().trim().min(3).max(5000),
    measures: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), z.string().trim().max(5000).nullish()),
    visibleToFamily: z.boolean().default(true),
    notifyFamily: z.boolean().default(true),
    refId: z.number().int().positive().nullish(),
  })
  .superRefine((b, ctx) => {
    const needsQuantity = CONDUCT_KINDS_WITH_QUANTITY.includes(b.kind);
    if (needsQuantity && !b.quantity) ctx.addIssue({ code: 'custom', path: ['quantity'], message: b.kind === 'SUSPENSION' ? 'indicá los días de suspensión' : 'indicá cuántas amonestaciones' });
    if (!needsQuantity && b.kind !== 'RECTIFICACION' && b.quantity != null) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'solo las amonestaciones y suspensiones llevan cantidad' });
    if (b.kind === 'RECTIFICACION' && !b.refId) ctx.addIssue({ code: 'custom', path: ['refId'], message: 'elegí el registro que se rectifica' });
    if (b.kind !== 'RECTIFICACION' && b.refId) ctx.addIssue({ code: 'custom', path: ['refId'], message: 'solo una rectificación apunta a otro registro' });
  });

export type ConductInput = z.infer<typeof conductBody>;

/** GET /students/:id/conduct */
export const listConduct = { params: idParam };

/** POST /students/:id/conduct */
export const createConduct = { params: idParam, body: conductBody };
