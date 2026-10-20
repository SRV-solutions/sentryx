/**
 * Legajo del personal (plan Profesional): cargos, horas, turnos y horario de cada persona.
 * Rutas en routes/staffRecords.routes.ts.
 */
import { z } from 'zod';
import { Op } from 'sequelize';
import { StaffPosition, User, UserRole, Level } from '../models';
import { asyncHandler, badRequest, notFound } from '../lib/http';
import { NON_STAFF_ROLES, SchoolRole } from '../constants/roles';
import { roleLabel } from '../services/roleRegistry';
import { DEFAULT_PLAN, PlanFeature, featuresOf, planDefinition } from '../constants/plans';
import { currentPlans } from '../services/plans';
import { audit } from '../services/audit';
import * as Validator from '../validators/staffRecords.validator';

/** Personal activo del colegio con sus roles. */
export const staffMembers = async (schoolId: number) => {
  const roles = await UserRole.findAll({
    where: { schoolId, active: true, role: { [Op.notIn]: NON_STAFF_ROLES } },
    include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'dni', 'email', 'avatar'] }],
  });
  const byUser = new Map<number, { user: User; roles: SchoolRole[] }>();
  for (const role of roles) {
    const user = (role as unknown as { User: User }).User;
    const entry = byUser.get(user.id) ?? { user, roles: [] };
    entry.roles.push(role.role as SchoolRole);
    byUser.set(user.id, entry);
  }
  return byUser;
};

const assertStaffMember = async (schoolId: number, userId: number) => {
  if (!(await UserRole.count({ where: { schoolId, userId, active: true, role: { [Op.notIn]: NON_STAFF_ROLES } } }))) {
    throw badRequest('Esa persona no es parte del personal del colegio.');
  }
};

const assertLevel = async (schoolId: number, levelId?: number | null) => {
  if (levelId && !(await Level.count({ where: { id: levelId, schoolId } }))) throw badRequest('Nivel inválido.');
};

const positionAttributes = ['id', 'userId', 'title', 'kind', 'situation', 'weeklyHours', 'shift', 'levelId', 'startDate', 'endDate', 'schedule', 'notes', 'active'];

// GET /staff-records — todo el personal con sus cargos y horas
export const listStaffRecords = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const members = await staffMembers(session.schoolId);
  const userIds = [...members.keys()];
  const [positions, plans] = await Promise.all([
    StaffPosition.findAll({ where: { schoolId: session.schoolId, userId: userIds.length ? userIds : [0] }, attributes: positionAttributes, order: [['active', 'DESC'], ['title', 'ASC']] }),
    currentPlans(session.schoolId, userIds),
  ]);
  const result = [...members.values()]
    .map(({ user, roles }) => {
      const own = positions.filter((p) => p.userId === user.id);
      const plan = plans.get(user.id) ?? DEFAULT_PLAN;
      return {
        userId: user.id,
        name: `${user.lastName}, ${user.firstName}`,
        avatar: user.avatar,
        dni: user.dni,
        roles: roles.map((r) => roleLabel(r)),
        plan: planDefinition(plan).name,
        /** Con su plan, ¿ve su propio legajo y sus recibos? */
        seesOwnRecords: featuresOf(plan).has(PlanFeature.STAFF_RECORDS),
        weeklyHours: own.filter((p) => p.active).reduce((sum, p) => sum + p.weeklyHours, 0),
        positions: own,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  res.json(result);
});

// GET /staff-records/me — mi legajo
export const getMyRecord = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const positions = await StaffPosition.findAll({
    where: { schoolId: session.schoolId, userId: session.userId, active: true },
    attributes: positionAttributes,
    include: [{ model: Level, attributes: ['id', 'name'] }],
    order: [['title', 'ASC']],
  });
  res.json({ positions, weeklyHours: positions.reduce((sum, p) => sum + p.weeklyHours, 0) });
});

// POST /staff-positions
export const createPosition = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const body = req.body as z.infer<typeof Validator.createPosition.body>;
  await assertStaffMember(session.schoolId, body.userId);
  await assertLevel(session.schoolId, body.levelId);
  const position = await StaffPosition.create({
    ...body,
    schoolId: session.schoolId,
    shift: body.shift ?? null,
    levelId: body.levelId ?? null,
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    notes: body.notes ?? null,
  });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'StaffPosition', entityId: position.id, action: 'create', after: position.toJSON() });
  res.status(201).json(position);
});

// PATCH /staff-positions/:id
export const updatePosition = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const position = await StaffPosition.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
  if (!position) throw notFound();
  await assertLevel(session.schoolId, req.body.levelId);
  const before = position.toJSON();
  await position.update(req.body);
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'StaffPosition', entityId: position.id, action: 'update', before, after: position.toJSON() });
  res.json(position);
});

// DELETE /staff-positions/:id
export const deletePosition = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const position = await StaffPosition.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
  if (!position) throw notFound();
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'StaffPosition', entityId: position.id, action: 'delete', before: position.toJSON() });
  await position.destroy();
  res.status(204).end();
});
