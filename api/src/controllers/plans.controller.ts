/** Controlador de planes: la lógica de cada ruta de routes/plans.routes.ts. */
import { Op, QueryTypes } from 'sequelize';
import { z } from 'zod';
import { AccessPeriod, PlanRequest, User, UserRole, sequelize } from '../models';
import { asyncHandler, badRequest, notFound } from '../lib/http';
import { PLAN_CATALOG, PLAN_CODES, PlanCode, DEFAULT_PLAN, planDefinition, planRank, featuresOf, FEATURE_LABELS } from '../constants/plans';
import { CATEGORY_LABELS, Category, RoleCode } from '../constants/roles';
import { changePlans, currentPlans } from '../services/plans';
import { reconcileAccess } from '../services/billing';
import { GB } from '../services/files';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';
import { isTechEmail } from '../services/accounts';
import * as PlansValidator from '../validators/plans.validator';

const catalogForDisplay = () =>
  PLAN_CATALOG.map((plan) => ({
    ...plan,
    features: [...featuresOf(plan.code)].map((feature) => ({ feature, label: FEATURE_LABELS[feature] })),
  }));

// GET /plans/catalog
export const getCatalog = asyncHandler(async (_req, res) => {
  res.json(catalogForDisplay());
});

// GET /plans/mine — mi plan y mi pedido pendiente (si lo hay)
export const getMyPlan = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const pending = await PlanRequest.findOne({ where: { schoolId: session.schoolId, userId: session.userId, status: 'PENDIENTE' }, order: [['createdAt', 'DESC']] });
  res.json({ plan: session.plan, catalog: catalogForDisplay(), pendingRequest: pending });
});

/**
 * Personas con acceso al colegio y su plan. Base: los períodos de acceso abiertos (los mismos que se facturan).
 */
// GET /plans/members
export const listMembers = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { category, plan, q } = req.query as unknown as z.infer<typeof PlansValidator.listMembers.query>;
  await reconcileAccess(session.schoolId);
  const periods = await AccessPeriod.findAll({
    where: { schoolId: session.schoolId, endedAt: null, ...(category ? { category } : {}) },
    include: [
      {
        model: User,
        attributes: ['id', 'firstName', 'lastName', 'email', 'dni', 'avatar'],
        ...(q ? { where: { [Op.or]: [{ firstName: { [Op.iLike]: `%${q}%` } }, { lastName: { [Op.iLike]: `%${q}%` } }, { dni: { [Op.iLike]: `${q}%` } }] } } : {}),
      },
    ],
    limit: 3000,
  });
  const userIds = periods.map((p) => p.userId);
  const [plans, storage] = await Promise.all([
    currentPlans(session.schoolId, userIds),
    sequelize.query(
      `SELECT "uploaderId", SUM(size)::bigint AS bytes FROM "FileAsset" WHERE "schoolId" = :sid AND purpose <> 'PAYROLL' GROUP BY "uploaderId"`,
      { replacements: { sid: session.schoolId }, type: QueryTypes.SELECT }
    ) as Promise<Array<{ uploaderId: number; bytes: string }>>,
  ]);
  const usedBy = new Map(storage.map((s) => [s.uploaderId, Number(s.bytes)]));
  const members = periods
    .map((period) => {
      const user = (period as unknown as { User: User }).User;
      const code = plans.get(period.userId) ?? DEFAULT_PLAN;
      return {
        userId: period.userId,
        name: `${user.lastName}, ${user.firstName}`,
        login: user.dni ?? (isTechEmail(user.email) ? '' : user.email),
        avatar: user.avatar,
        category: period.category as Category,
        categoryLabel: CATEGORY_LABELS[period.category as Category],
        plan: code,
        storageUsed: usedBy.get(period.userId) ?? 0,
        storageLimit: planDefinition(code).storageGb * GB,
      };
    })
    .filter((member) => !plan || member.plan === plan)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  // Resumen del colegio entero (sin filtros): cuántas personas por plan y cuánto suma por mes.
  const allPlans = category || plan || q ? await currentPlans(session.schoolId) : plans;
  const activeTotal = await AccessPeriod.count({ where: { schoolId: session.schoolId, endedAt: null } });
  const counts = Object.fromEntries(PLAN_CODES.map((code) => [code, 0])) as Record<PlanCode, number>;
  const activeIds = new Set((await AccessPeriod.findAll({ where: { schoolId: session.schoolId, endedAt: null }, attributes: ['userId'], raw: true })).map((p) => p.userId));
  for (const [userId, code] of allPlans) if (activeIds.has(userId)) counts[code]++;
  counts[DEFAULT_PLAN] = activeTotal - PLAN_CODES.filter((c) => c !== DEFAULT_PLAN).reduce((sum, c) => sum + counts[c], 0);
  const monthly = PLAN_CODES.reduce((sum, code) => sum + counts[code] * planDefinition(code).price, 0);

  res.json({ members, summary: { counts, monthly, activeTotal } });
});

// PUT /plans/members
export const changeMembersPlan = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { userIds, plan } = req.body as z.infer<typeof PlansValidator.changeMembersPlan.body>;
  // Solo personas que hoy tienen acceso a este colegio.
  const valid = (await AccessPeriod.findAll({ where: { schoolId: session.schoolId, endedAt: null, userId: userIds }, attributes: ['userId'], raw: true })).map((p) => p.userId);
  const outside = userIds.filter((id) => !valid.includes(id));
  if (outside.length) throw badRequest(`${outside.length} de las personas elegidas no tienen acceso a este colegio.`);
  const result = await changePlans({ schoolId: session.schoolId, userIds: valid, plan, changedById: session.userId });
  // Si alguien lo había pedido, queda resuelto.
  await PlanRequest.update(
    { status: 'APROBADA', resolvedById: session.userId, resolvedAt: new Date() },
    { where: { schoolId: session.schoolId, userId: valid, status: 'PENDIENTE', plan: PLAN_CODES.filter((c) => planRank(c) <= planRank(plan)) } }
  );
  if (result.changed) {
    notify({
      userIds: valid,
      title: `Tu plan ahora es ${planDefinition(plan).name}`,
      message: `La institución cambió tu plan a ${planDefinition(plan).name}. Ya podés usar lo que incluye.`,
      type: 'plan',
      link: '/perfil/me',
      email: 'never',
    });
  }
  res.json(result);
});

// POST /plans/requests
export const createRequest = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { plan, note } = req.body as z.infer<typeof PlansValidator.createRequest.body>;
  if (planRank(plan) <= planRank(session.plan)) throw badRequest(`Ya tenés el plan ${planDefinition(session.plan).name}, que incluye eso.`);
  const [request, created] = await PlanRequest.findOrCreate({
    where: { schoolId: session.schoolId, userId: session.userId, status: 'PENDIENTE' },
    defaults: { schoolId: session.schoolId, userId: session.userId, plan, note: note ?? null, resolvedById: null, resolvedAt: null },
  });
  const changedPlan = !created && request.plan !== plan;
  if (!created) await request.update({ plan, note: note ?? null });
  // Solo se avisa si es un pedido nuevo o cambió el plan pedido (repetir el pedido no vuelve a notificar).
  if (!created && !changedPlan) return res.json(request);
  const legalReps = await UserRole.findAll({ where: { schoolId: session.schoolId, role: RoleCode.REPRESENTANTE_LEGAL, active: true }, attributes: ['userId'], raw: true });
  const me = await User.findByPk(session.userId, { attributes: ['firstName', 'lastName'] });
  notify({
    userIds: legalReps.map((r) => r.userId as number),
    title: `${me?.firstName} ${me?.lastName} pide el plan ${planDefinition(plan).name}`,
    message: note ? note.slice(0, 200) : `Revisalo en Planes (${planDefinition(plan).price} por mes).`,
    type: 'plan',
    link: '/planes?tab=pedidos',
    email: 'fallback',
  });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'PlanRequest', entityId: request.id, action: 'request', after: { plan, note } });
  res.status(created ? 201 : 200).json(request);
});

// GET /plans/requests
export const listRequests = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { status } = req.query as { status?: string };
  const requests = await PlanRequest.findAll({
    where: { schoolId: session.schoolId, ...(status ? { status } : {}) },
    include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'avatar'] }],
    order: [['createdAt', 'DESC']],
    limit: 200,
  });
  const plans = await currentPlans(session.schoolId, requests.map((r) => r.userId));
  res.json(requests.map((r) => ({ ...r.toJSON(), currentPlan: plans.get(r.userId) ?? DEFAULT_PLAN })));
});

// POST /plans/requests/:id/resolve
export const resolveRequest = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const request = await PlanRequest.findOne({ where: { id: req.params.id, schoolId: session.schoolId, status: 'PENDIENTE' } });
  if (!request) throw notFound('El pedido no existe o ya se resolvió.');
  const { approve } = req.body as { approve: boolean };
  if (approve) {
    const hasAccess = await AccessPeriod.count({ where: { schoolId: session.schoolId, userId: request.userId, endedAt: null } });
    if (!hasAccess) throw badRequest('Esa persona ya no tiene acceso al colegio.');
    await changePlans({ schoolId: session.schoolId, userIds: [request.userId], plan: request.plan, changedById: session.userId });
  }
  await request.update({ status: approve ? 'APROBADA' : 'RECHAZADA', resolvedById: session.userId, resolvedAt: new Date() });
  notify({
    userIds: [request.userId],
    title: approve ? `Aprobaron tu pedido: plan ${planDefinition(request.plan).name}` : 'Tu pedido de cambio de plan no fue aprobado',
    message: approve ? 'Ya podés usar todo lo que incluye.' : 'Consultá con la institución si tenés dudas.',
    type: 'plan',
    link: '/perfil/me',
    email: 'never',
  });
  res.json(request);
});
