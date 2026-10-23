/** Validaciones (zod) del legajo del personal y de los recibos de sueldo. */
import { z } from 'zod';
import { idParam } from '../lib/http';
import { POSITION_KINDS, POSITION_SITUATIONS, RECEIPT_KINDS, PAY_MODES } from '../models/school/staff';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'usá el formato HH:MM');
const slot = z
  .object({
    day: z.number().int().min(1).max(6),
    from: time,
    to: time,
    label: z.string().trim().max(80).optional(),
    modules: z.number().int().min(1).max(12).optional(),
    subjectId: z.number().int().positive().optional(),
    divisionId: z.number().int().positive().optional(),
  })
  .refine((s) => s.from < s.to, { message: 'la hora de fin tiene que ser posterior a la de inicio' });

const positionBody = z.object({
  userId: z.number().int().positive(),
  title: z.string().trim().min(2).max(120),
  kind: z.enum(POSITION_KINDS).default('CARGO'),
  situation: z.enum(POSITION_SITUATIONS).default('TITULAR'),
  weeklyHours: z.number().min(0).max(80).default(0),
  shift: z.string().trim().max(30).nullish(),
  levelId: z.number().int().positive().nullish(),
  startDate: z.string().date().nullish(),
  endDate: z.string().date().nullish(),
  schedule: z.array(slot).max(40).default([]),
  notes: z.string().trim().max(2000).nullish(),
  moduleMinutes: z.number().int().min(20).max(120).optional(),
  payMode: z.enum(PAY_MODES).optional(),
  rate: z.number().min(0).max(100_000_000).optional(),
});

/** POST /staff-positions */
export const createPosition = { body: positionBody };
/** PATCH /staff-positions/:id */
export const updatePosition = { params: idParam, body: positionBody.omit({ userId: true }).partial().extend({ active: z.boolean().optional() }) };
/** DELETE /staff-positions/:id */
export const deletePosition = { params: idParam };

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'usá el formato AAAA-MM');

/** GET /payroll */
export const listReceipts = { query: z.object({ period: period.optional(), userId: z.coerce.number().int().optional() }) };

/** POST /payroll */
export const createReceipt = {
  body: z.object({
    userId: z.number().int().positive(),
    period,
    kind: z.enum(RECEIPT_KINDS).default('SUELDO'),
    fileId: z.number().int().positive(),
    netAmount: z.number().min(0).max(1e10).nullish(),
  }),
};

/** POST /payroll/bulk — varios PDF a la vez; cada uno se asigna por el DNI que figura en el nombre del archivo. */
export const createReceiptsInBulk = {
  body: z.object({ period, kind: z.enum(RECEIPT_KINDS).default('SUELDO'), fileIds: z.array(z.number().int().positive()).min(1).max(500) }),
};

/** POST /payroll/:id/acknowledge — conformidad de la persona. */
export const acknowledgeReceipt = {
  params: idParam,
  body: z
    .object({ agreed: z.boolean(), observation: z.string().trim().max(1000).nullish() })
    .refine((b) => b.agreed || !!b.observation, { message: 'contá el motivo de la disconformidad', path: ['observation'] }),
};

export const receiptId = { params: idParam };
