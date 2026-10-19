/**
 * Recibos de sueldo digitales (plan Profesional). Administración sube el PDF de cada persona;
 * la persona lo ve en "Mi legajo" y deja su conformidad (o disconformidad con el motivo).
 * Rutas en routes/staffRecords.routes.ts.
 */
import { z } from 'zod';
import { PayrollReceipt, FileAsset, User, sequelize } from '../models';
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/http';
import { DEFAULT_PLAN, PlanFeature, featuresOf, minimumPlanFor } from '../constants/plans';
import { Entity, Action } from '../constants/permissions';
import { currentPlans } from '../services/plans';
import { signFiles, deleteFile } from '../services/files';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';
import { staffMembers } from './staffRecords.controller';
import type { SchoolSession } from '../services/schoolSession';
import * as Validator from '../validators/staffRecords.validator';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const periodLabel = (period: string) => `${MONTHS[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`;

/** El recibo solo se emite a quien tiene el plan que lo incluye (es lo que se le cobra). */
const hasPayrollPlan = async (schoolId: number, userId: number) =>
  featuresOf((await currentPlans(schoolId, [userId])).get(userId) ?? DEFAULT_PLAN).has(PlanFeature.PAYROLL);

/** El archivo tiene que ser un PDF de recibo que subió esta misma persona y que todavía no se usó. */
const payrollFile = async (session: SchoolSession, fileId: number) => {
  const file = await FileAsset.findOne({ where: { id: fileId, schoolId: session.schoolId, uploaderId: session.userId, purpose: 'PAYROLL', status: 'READY' } });
  if (!file) throw badRequest('Archivo de recibo inválido: subilo de nuevo.');
  if (await PayrollReceipt.count({ where: { fileId } })) throw badRequest(`"${file.name}" ya está asignado a otro recibo.`);
  return file;
};

/** Crea o reemplaza el recibo de ese período (si se reemplaza, el anterior se borra y se pide conformidad de nuevo). */
const saveReceipt = async (session: SchoolSession, input: { userId: number; period: string; kind: z.infer<typeof Validator.createReceipt.body>['kind']; fileId: number; netAmount: number | null }) => {
  const existing = await PayrollReceipt.findOne({ where: { schoolId: session.schoolId, userId: input.userId, period: input.period, kind: input.kind } });
  let receipt: PayrollReceipt;
  if (existing) {
    const oldFile = await FileAsset.findByPk(existing.fileId);
    await existing.update({ fileId: input.fileId, netAmount: input.netAmount, uploadedById: session.userId, viewedAt: null, acknowledgedAt: null, agreed: null, observation: null });
    if (oldFile) await deleteFile(oldFile);
    receipt = existing;
  } else {
    receipt = await PayrollReceipt.create({ ...input, schoolId: session.schoolId, uploadedById: session.userId, viewedAt: null, acknowledgedAt: null, agreed: null, observation: null });
  }
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'PayrollReceipt', entityId: receipt.id, action: existing ? 'replace' : 'create', after: { userId: input.userId, period: input.period, kind: input.kind } });
  notify({
    userIds: [input.userId],
    title: `Nuevo recibo de sueldo: ${periodLabel(input.period)}`,
    message: 'Ya podés verlo y dar tu conformidad en "Mi legajo".',
    type: 'payroll',
    link: '/mi-legajo',
    email: 'fallback',
  });
  return receipt;
};

// GET /payroll — recibos de un período y quién falta
export const listReceipts = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { period, userId } = req.query as unknown as z.infer<typeof Validator.listReceipts.query>;
  const receipts = await PayrollReceipt.findAll({
    where: { schoolId: session.schoolId, ...(period ? { period } : {}), ...(userId ? { userId } : {}) },
    include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'dni'] }],
    order: [['period', 'DESC'], [User, 'lastName', 'ASC']],
    limit: 2000,
  });
  const members = await staffMembers(session.schoolId);
  const plans = await currentPlans(session.schoolId, [...members.keys()]);
  const staff = [...members.values()]
    .map(({ user }) => ({
      userId: user.id,
      name: `${user.lastName}, ${user.firstName}`,
      dni: user.dni,
      eligible: featuresOf(plans.get(user.id) ?? DEFAULT_PLAN).has(PlanFeature.PAYROLL),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  res.json({ receipts, staff, requiredPlan: minimumPlanFor(PlanFeature.PAYROLL).name });
});

// POST /payroll
export const createReceipt = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const body = req.body as z.infer<typeof Validator.createReceipt.body>;
  const members = await staffMembers(session.schoolId);
  if (!members.has(body.userId)) throw badRequest('Esa persona no es parte del personal del colegio.');
  if (!(await hasPayrollPlan(session.schoolId, body.userId))) {
    throw badRequest(`Para recibir recibos digitales, la persona necesita el plan ${minimumPlanFor(PlanFeature.PAYROLL).name}. Cambialo en "Planes".`);
  }
  await payrollFile(session, body.fileId);
  const receipt = await saveReceipt(session, { ...body, netAmount: body.netAmount ?? null });
  res.status(201).json(receipt);
});

/** Busca un DNI (7 u 8 dígitos, con o sin puntos) en el nombre del archivo: "recibo_28.111.222_marzo.pdf". */
const dniInFileName = (name: string) => name.replace(/(?<=\d)\.(?=\d{3})/g, '').match(/(?<!\d)\d{7,8}(?!\d)/g) ?? [];

// POST /payroll/bulk
export const createReceiptsInBulk = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { period, kind, fileIds } = req.body as z.infer<typeof Validator.createReceiptsInBulk.body>;
  const members = await staffMembers(session.schoolId);
  const byDni = new Map([...members.values()].filter(({ user }) => user.dni).map(({ user }) => [user.dni!.replace(/\D/g, ''), user]));
  const plans = await currentPlans(session.schoolId, [...members.keys()]);
  const created: Array<{ fileId: number; userId: number; name: string }> = [];
  const unmatched: Array<{ fileId: number; fileName: string; reason: string }> = [];

  for (const fileId of fileIds) {
    let file: FileAsset;
    try {
      file = await payrollFile(session, fileId);
    } catch (err) {
      unmatched.push({ fileId, fileName: `#${fileId}`, reason: (err as Error).message });
      continue;
    }
    const user = dniInFileName(file.name).map((dni) => byDni.get(dni)).find(Boolean);
    if (!user) {
      unmatched.push({ fileId, fileName: file.name, reason: 'No encontramos un DNI del personal en el nombre del archivo.' });
      continue;
    }
    if (!featuresOf(plans.get(user.id) ?? DEFAULT_PLAN).has(PlanFeature.PAYROLL)) {
      unmatched.push({ fileId, fileName: file.name, reason: `${user.firstName} ${user.lastName} no tiene el plan ${minimumPlanFor(PlanFeature.PAYROLL).name}.` });
      continue;
    }
    if (created.some((c) => c.userId === user.id)) {
      unmatched.push({ fileId, fileName: file.name, reason: `Hay otro archivo para ${user.firstName} ${user.lastName} en esta carga.` });
      continue;
    }
    await saveReceipt(session, { userId: user.id, period, kind, fileId, netAmount: null });
    created.push({ fileId, userId: user.id, name: `${user.lastName}, ${user.firstName}` });
  }
  res.json({ created, unmatched });
});

// DELETE /payroll/:id — anular un recibo (queda en la auditoría)
export const deleteReceipt = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const receipt = await PayrollReceipt.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
  if (!receipt) throw notFound();
  const file = await FileAsset.findByPk(receipt.fileId);
  await sequelize.transaction(async (transaction) => {
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'PayrollReceipt', entityId: receipt.id, action: 'delete', before: receipt.toJSON() }, transaction);
    await receipt.destroy({ transaction });
  });
  if (file) await deleteFile(file);
  res.status(204).end();
});

// GET /payroll/mine — mis recibos
export const listMyReceipts = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const receipts = await PayrollReceipt.findAll({
    where: { schoolId: session.schoolId, userId: session.userId },
    attributes: ['id', 'period', 'kind', 'netAmount', 'viewedAt', 'acknowledgedAt', 'agreed', 'observation', 'createdAt'],
    order: [['period', 'DESC'], ['kind', 'ASC']],
  });
  res.json(receipts);
});

// GET /payroll/:id/file — link para ver el PDF (si lo abre la persona, queda como visto)
export const getReceiptFile = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const receipt = await PayrollReceipt.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
  if (!receipt) throw notFound();
  const own = receipt.userId === session.userId;
  if (!own && !session.can(Entity.PAYROLL, Action.READ)) throw forbidden();
  if (own && !session.hasFeature(PlanFeature.PAYROLL)) throw forbidden('Tu plan no incluye recibos digitales.');
  if (own && !receipt.viewedAt) await receipt.update({ viewedAt: new Date() });
  const signed = (await signFiles([receipt.fileId])).get(receipt.fileId);
  if (!signed) throw notFound('No encontramos el archivo del recibo.');
  res.json(signed);
});

// POST /payroll/:id/acknowledge — conformidad
export const acknowledgeReceipt = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const receipt = await PayrollReceipt.findOne({ where: { id: req.params.id, schoolId: session.schoolId, userId: session.userId } });
  if (!receipt) throw notFound();
  if (receipt.acknowledgedAt) throw badRequest('Ya registraste tu conformidad para este recibo.');
  const { agreed, observation } = req.body as { agreed: boolean; observation?: string | null };
  await receipt.update({ acknowledgedAt: new Date(), agreed, observation: observation ?? null, viewedAt: receipt.viewedAt ?? new Date() });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'PayrollReceipt', entityId: receipt.id, action: agreed ? 'agree' : 'disagree', after: { observation } });
  if (!agreed) {
    // Avisar a quien lo subió para que lo revise.
    notify({
      userIds: [receipt.uploadedById],
      title: `Disconformidad con un recibo (${periodLabel(receipt.period)})`,
      message: (observation ?? '').slice(0, 200),
      type: 'payroll',
      link: `/personal?tab=recibos&period=${receipt.period}`,
      email: 'fallback',
    });
  }
  res.json(receipt);
});
