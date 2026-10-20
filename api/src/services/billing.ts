import { QueryTypes } from 'sequelize';
import { AccessPeriod, BillingStatement, School, sequelize } from '../models';
import { env } from '../config/env';
import { Category, CATEGORIES } from '../constants/school';
import { categoryOfRoles } from './roleRegistry';
import { DEFAULT_PLAN, PLAN_CODES, PlanCode, planPrice, planRank } from '../constants/plans';

/**
 * FACTURACIÓN POR USUARIO ACTIVO
 *
 * Regla: se cobra el precio mensual completo DEL PLAN de cada persona que tuvo acceso al colegio AL MENOS
 * UN DÍA del ciclo (mes calendario). Quien se desactiva el día 29 se cobra ese mes. Si en el mes tuvo
 * más de un plan (constants/plans.ts), se cobra el más alto.
 *
 * "Tener acceso" = cuenta habilitada (User.isActive) y además alguno de:
 *  - rol de personal activo (UserRole),
 *  - cuenta de estudiante activa vinculada a un alumno activo,
 *  - vínculo familiar vigente con un alumno activo.
 *
 * Nada se borra: los cambios abren o cierran AccessPeriod. Los ciclos pasados se congelan en
 * BillingStatement con el precio de ese momento.
 */

interface CurrentAccess {
  userId: number;
  roles: string[];
  since: Date;
}

/** Quién tiene acceso HOY al colegio (opcionalmente, solo esos usuarios). */
const currentAccess = async (schoolId: number, userIds?: number[]) =>
  (await sequelize.query(
    `WITH acc AS (
       SELECT m."userId", m.role::text AS role, m."createdAt" AS since FROM "UserRole" m
        WHERE m."schoolId" = :sid AND m.active AND m.role NOT IN ('TUTOR', 'ESTUDIANTE')
       UNION ALL
       SELECT m."userId", 'ESTUDIANTE', m."createdAt" FROM "UserRole" m
         JOIN "Student" s ON s."userId" = m."userId" AND s."schoolId" = m."schoolId" AND s.active
        WHERE m."schoolId" = :sid AND m.active AND m.role = 'ESTUDIANTE'
       UNION ALL
       SELECT g."userId", 'TUTOR', g."createdAt" FROM "StudentGuardian" g
         JOIN "Student" s ON s.id = g."studentId" AND s."schoolId" = :sid AND s.active
        WHERE g.active
     )
     SELECT acc."userId", array_agg(DISTINCT acc.role) AS roles, MIN(acc.since) AS since
       FROM acc JOIN "User" u ON u.id = acc."userId" AND u."isActive"
      ${userIds ? 'WHERE acc."userId" IN (:uids)' : ''}
      GROUP BY acc."userId"`,
    { replacements: { sid: schoolId, uids: userIds?.length ? userIds : [0] }, type: QueryTypes.SELECT }
  )) as CurrentAccess[];

/**
 * Sincroniza los períodos de acceso con el estado actual: abre los que faltan, cierra los que ya no
 * corresponden y actualiza la categoría. Idempotente; se llama después de cada cambio de personas y
 * cada hora como red de seguridad. `backfill` usa la fecha de alta original (primera migración).
 */
export const reconcileAccess = async (schoolId: number, opts: { userIds?: number[]; backfill?: boolean } = {}) => {
  const now = new Date();
  // Colegio suspendido: nadie tiene acceso (se cierran los períodos y deja de facturarse desde el mes siguiente).
  const schoolActive = !!(await School.count({ where: { id: schoolId, active: true } }));
  const [current, open] = await Promise.all([
    schoolActive ? currentAccess(schoolId, opts.userIds) : Promise.resolve([] as CurrentAccess[]),
    AccessPeriod.findAll({ where: { schoolId, endedAt: null, ...(opts.userIds ? { userId: opts.userIds } : {}) } }),
  ]);
  const openBy = new Map(open.map((p) => [p.userId, p]));
  const seen = new Set<number>();
  let opened = 0;
  let closed = 0;
  for (const a of current) {
    seen.add(a.userId);
    const category = categoryOfRoles(a.roles as string[]) ?? 'FAMILIA';
    const p = openBy.get(a.userId);
    if (!p) {
      await AccessPeriod.create({ schoolId, userId: a.userId, category, startedAt: opts.backfill ? new Date(a.since) : now, endedAt: null });
      opened++;
    } else if (p.category !== category) {
      await p.update({ category });
    }
  }
  for (const p of open) {
    if (!seen.has(p.userId)) {
      await p.update({ endedAt: now });
      closed++;
    }
  }
  return { opened, closed };
};

/** Fire-and-forget después de un cambio (no frena la respuesta; los errores quedan en el log). */
export const touchAccess = (schoolId: number, userIds?: number[]) => {
  reconcileAccess(schoolId, { userIds }).catch((err) => console.error('[billing] reconcile', err));
};

export const reconcileAllSchools = async () => {
  for (const s of await School.findAll({ attributes: ['id'] })) await reconcileAccess(s.id);
};

// ---------------- Ciclos ----------------

export const cycleOf = (d = new Date()) => {
  const local = new Date(d.getTime() + offsetMinutes() * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
};
const offsetMinutes = () => {
  const [, sign, h, m] = /^([+-])(\d{2}):(\d{2})$/.exec(env.BILLING_TZ_OFFSET)!;
  return (sign === '-' ? -1 : 1) * (Number(h) * 60 + Number(m));
};
/** Límites del ciclo en hora local del colegio: [inicio, fin). */
export const cycleBounds = (cycle: string) => {
  const [y, mo] = cycle.split('-').map(Number);
  const start = new Date(`${cycle}-01T00:00:00${env.BILLING_TZ_OFFSET}`);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  const end = new Date(`${next}-01T00:00:00${env.BILLING_TZ_OFFSET}`);
  return { start, end };
};

export interface BillingLine {
  userId: number;
  name: string;
  login: string;
  category: Category;
  /** Inicio del primer período que toca el ciclo (fecha de alta). */
  activeFrom: string;
  /** Fin del acceso si se desactivó y no volvió a activarse dentro del ciclo. */
  deactivatedAt: string | null;
  activeDays: number;
  /** Plan cobrado: el más alto que tuvo en el ciclo. */
  plan: PlanCode;
  amount: number;
}

export interface BillingSummary {
  schoolId: number;
  cycle: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
  unitPrice: number;
  currency: 'ARS';
  period: { start: string; end: string };
  billableUsers: number;
  activeNow: number;
  deactivatedInCycle: number;
  newInCycle: number;
  byCategory: Record<Category, { users: number; amount: number }>;
  byPlan: Record<PlanCode, { users: number; amount: number; price: number }>;
  total: number;
  lines: BillingLine[];
}

const DAY = 86_400_000;

/** Plan más alto de cada usuario dentro del ciclo (sin períodos de plan: Básico). */
const highestPlansInCycle = async (schoolId: number, start: Date, end: Date) => {
  const rows = (await sequelize.query(
    `SELECT "userId", plan FROM "PlanAssignment"
      WHERE "schoolId" = :sid AND "startedAt" < :end AND ("endedAt" IS NULL OR "endedAt" > :start)`,
    { replacements: { sid: schoolId, start, end }, type: QueryTypes.SELECT }
  )) as Array<{ userId: number; plan: PlanCode }>;
  const highest = new Map<number, PlanCode>();
  for (const row of rows) {
    const current = highest.get(row.userId);
    if (!current || planRank(row.plan) > planRank(current)) highest.set(row.userId, row.plan);
  }
  return highest;
};

const computeLines = async (schoolId: number, cycle: string): Promise<BillingLine[]> => {
  const { start, end } = cycleBounds(cycle);
  const plans = await highestPlansInCycle(schoolId, start, end);
  const periods = (await sequelize.query(
    `SELECT p."userId", p.category, p."startedAt", p."endedAt", u."firstName", u."lastName", u.dni, u.email
       FROM "AccessPeriod" p JOIN "User" u ON u.id = p."userId"
      WHERE p."schoolId" = :sid AND p."startedAt" < :end AND (p."endedAt" IS NULL OR p."endedAt" >= :start)
      ORDER BY u."lastName", u."firstName", p."startedAt"`,
    { replacements: { sid: schoolId, start, end }, type: QueryTypes.SELECT }
  )) as Array<{ userId: number; category: Category; startedAt: Date; endedAt: Date | null; firstName: string; lastName: string; dni: string | null; email: string }>;

  const byUser = new Map<number, typeof periods>();
  for (const p of periods) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);

  const rank = (c: Category) => CATEGORIES.indexOf(c);
  return [...byUser.values()].map((ps) => {
    const first = ps[0];
    const last = ps[ps.length - 1];
    // Días con acceso dentro del ciclo (informativo: el cargo es por mes completo).
    const ms = ps.reduce((sum, p) => {
      const a = Math.max(new Date(p.startedAt).getTime(), start.getTime());
      const b = Math.min((p.endedAt ? new Date(p.endedAt) : end).getTime(), end.getTime(), Date.now());
      return sum + Math.max(0, b - a);
    }, 0);
    const category = ps.map((p) => p.category).sort((a, b) => rank(a) - rank(b))[0];
    const ended = last.endedAt && new Date(last.endedAt) < end ? new Date(last.endedAt).toISOString() : null;
    const plan = plans.get(first.userId) ?? DEFAULT_PLAN;
    return {
      userId: first.userId,
      name: `${first.lastName}, ${first.firstName}`,
      login: first.dni ?? (first.email.endsWith('@sin-email.local') ? '' : first.email),
      category,
      activeFrom: new Date(first.startedAt).toISOString(),
      deactivatedAt: ended,
      activeDays: Math.max(1, Math.ceil(ms / DAY)),
      plan,
      amount: planPrice(plan),
    };
  });
};

const summarize = (schoolId: number, cycle: string, unitPrice: number, lines: BillingLine[], status: 'OPEN' | 'CLOSED', closedAt: Date | null, activeNow: number): BillingSummary => {
  const { start, end } = cycleBounds(cycle);
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, { users: 0, amount: 0 }])) as BillingSummary['byCategory'];
  const byPlan = Object.fromEntries(PLAN_CODES.map((p) => [p, { users: 0, amount: 0, price: planPrice(p) }])) as BillingSummary['byPlan'];
  for (const l of lines) {
    byCategory[l.category].users++;
    byCategory[l.category].amount += l.amount;
    // Liquidaciones cerradas antes de los planes: todas eran Básico.
    const plan = l.plan ?? DEFAULT_PLAN;
    byPlan[plan].users++;
    byPlan[plan].amount += l.amount;
  }
  return {
    schoolId,
    cycle,
    status,
    closedAt: closedAt?.toISOString() ?? null,
    unitPrice,
    currency: 'ARS',
    period: { start: start.toISOString(), end: end.toISOString() },
    billableUsers: lines.length,
    activeNow,
    deactivatedInCycle: lines.filter((l) => l.deactivatedAt).length,
    newInCycle: lines.filter((l) => new Date(l.activeFrom) >= start).length,
    byCategory,
    byPlan,
    total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
    lines,
  };
};

/**
 * Liquidación de un ciclo. El ciclo en curso es una ESTIMACIÓN (puede sumar usuarios hasta fin de mes).
 * Un ciclo terminado se congela la primera vez que se consulta (precio y detalle quedan fijos).
 */
export const billingFor = async (schoolId: number, cycle: string): Promise<BillingSummary> => {
  const { end } = cycleBounds(cycle);
  const activeNow = await AccessPeriod.count({ where: { schoolId, endedAt: null } });
  if (end.getTime() <= Date.now()) {
    const saved = await BillingStatement.findOne({ where: { schoolId, cycle } });
    if (saved) return summarize(schoolId, cycle, saved.unitPrice, saved.lines as BillingLine[], 'CLOSED', saved.closedAt, activeNow);
    const lines = await computeLines(schoolId, cycle);
    const closedAt = new Date();
    const total = lines.reduce((s, l) => s + l.amount, 0);
    await BillingStatement.findOrCreate({
      where: { schoolId, cycle },
      defaults: { schoolId, cycle, unitPrice: env.BILLING_PRICE_ARS, currency: 'ARS', billableUsers: lines.length, total, lines, closedAt },
    });
    return summarize(schoolId, cycle, env.BILLING_PRICE_ARS, lines, 'CLOSED', closedAt, activeNow);
  }
  await reconcileAccess(schoolId);
  const lines = await computeLines(schoolId, cycle);
  return summarize(schoolId, cycle, env.BILLING_PRICE_ARS, lines, 'OPEN', null, activeNow);
};

/** Ciclos disponibles: desde el primer acceso registrado hasta el actual. */
export const availableCycles = async (schoolId: number) => {
  const first = await AccessPeriod.min<Date, AccessPeriod>('startedAt', { where: { schoolId } });
  const out: string[] = [];
  const now = cycleOf();
  let c = first ? cycleOf(new Date(first)) : now;
  while (c <= now && out.length < 120) {
    out.push(c);
    const [y, m] = c.split('-').map(Number);
    c = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return out.reverse();
};

