/** Validaciones (zod) de las rutas de school. */
import { z } from 'zod';

/** PATCH /settings */
export const updateSettings = {
    body: z.object({
      name: z.string().trim().min(3).max(160).optional(),
      cue: z.string().max(20).nullish(),
      address: z.string().max(200).nullish(),
      phone: z.string().max(40).nullish(),
      email: z.string().email().max(120).nullish(),
      
      logoFileId: z.number().int().nullish(),
    }),
  };
