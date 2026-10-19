/**
 * Plan de cada persona en un colegio (ver constants/plans.ts).
 * El plan vigente es el período abierto de PlanAssignment; si no hay ninguno, el Básico.
 */
import { Op, Transaction } from 'sequelize';
import { PlanAssignment, sequelize } from '../models';
import { DEFAULT_PLAN, PlanCode, planDefinition } from '../constants/plans';
import { audit } from './audit';
import { invalidateSchoolSession } from './schoolSession';

/** Plan vigente de cada usuario (los que no figuran están en el Básico). */
export const currentPlans = async (schoolId: number, userIds?: number[]): Promise<Map<number, PlanCode>> => {
  const open = await PlanAssignment.findAll({
    where: { schoolId, endedAt: null, ...(userIds ? { userId: userIds.length ? userIds : [0] } : {}) },
    attributes: ['userId', 'plan'],
    raw: true,
  });
  return new Map(open.map((row) => [row.userId, row.plan]));
};

export const currentPlanOf = async (schoolId: number, userId: number): Promise<PlanCode> =>
  (await currentPlans(schoolId, [userId])).get(userId) ?? DEFAULT_PLAN;

/**
 * Cambia el plan de varias personas a la vez. Cierra el período vigente y abre uno nuevo
 * (no toca a quienes ya tienen ese plan). Las funciones se habilitan al instante; en la
 * facturación del mes se cobra el plan más alto que la persona tuvo en el mes.
 */
export const changePlans = async (opts: { schoolId: number; userIds: number[]; plan: PlanCode; changedById: number; transaction?: Transaction }) => {
  const now = new Date();
  const current = await currentPlans(opts.schoolId, opts.userIds);
  const changing = opts.userIds.filter((userId) => (current.get(userId) ?? DEFAULT_PLAN) !== opts.plan);
  if (!changing.length) return { changed: 0 };
  const run = async (transaction: Transaction) => {
    await PlanAssignment.update(
      { endedAt: now },
      { where: { schoolId: opts.schoolId, userId: { [Op.in]: changing }, endedAt: null }, transaction }
    );
    await PlanAssignment.bulkCreate(
      changing.map((userId) => ({ schoolId: opts.schoolId, userId, plan: opts.plan, startedAt: now, endedAt: null, changedById: opts.changedById })),
      { transaction }
    );
    await audit(
      {
        schoolId: opts.schoolId,
        userId: opts.changedById,
        entity: 'PlanAssignment',
        action: 'change-plan',
        after: { plan: planDefinition(opts.plan).name, userIds: changing, changes: changing.map((id) => ({ userId: id, from: current.get(id) ?? DEFAULT_PLAN })) },
      },
      transaction
    );
  };
  if (opts.transaction) await run(opts.transaction);
  else await sequelize.transaction(run);
  for (const userId of changing) invalidateSchoolSession(userId);
  return { changed: changing.length };
};
