/** Validaciones (zod) de suscripciones push. */
import { z } from 'zod';

/** POST /school/push/subscribe */
export const subscribe = {
  body: z.object({
    kind: z.enum(['WEBPUSH', 'EXPO']).default('WEBPUSH'),
    endpoint: z.string().url().max(1000).optional(),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }).optional(),
    token: z.string().max(500).optional(),
  }),
};

/** POST /school/push/unsubscribe */
export const unsubscribe = { body: z.object({ endpoint: z.string().max(1000) }) };
