/**
 * Consulta de auditoría (routes/audit.routes.ts):
 *  - Actividad: cada acción que modificó algo, con usuario, IP, fecha y resultado.
 *  - Cambios: el detalle de los cambios sensibles (antes/después) y los ingresos a la cuenta.
 */
import { Op, WhereOptions } from 'sequelize';
import { ActivityLog, AuditLog, User, UserRole, StudentGuardian, Student, School } from '../models';
import { asyncHandler } from '../lib/http';

interface Filters {
  page: number;
  limit: number;
  userId?: number;
  from?: string;
  to?: string;
  ip?: string;
  q?: string;
  entity?: string;
  action?: string;
  schoolId?: number;
}

const dateRange = ({ from, to }: Filters) =>
  from || to
    ? { createdAt: { ...(from ? { [Op.gte]: new Date(`${from}T00:00:00-03:00`) } : {}), ...(to ? { [Op.lte]: new Date(`${to}T23:59:59-03:00`) } : {}) } }
    : {};

const userInclude = { model: User, attributes: ['id', 'firstName', 'lastName', 'email', 'dni'] };

const paginated = <T>(rows: T[], count: number, { page, limit }: Filters) => ({
  data: rows,
  pagination: { totalItems: count, currentPage: page, totalPages: Math.ceil(count / limit) },
});

/** Usuarios de un colegio (personal, estudiantes y familias): para incluir sus ingresos en la auditoría del colegio. */
const schoolUserIds = async (schoolId: number) => {
  const [roles, guardians] = await Promise.all([
    UserRole.findAll({ where: { schoolId }, attributes: ['userId'], raw: true }),
    StudentGuardian.unscoped().findAll({ include: [{ model: Student, where: { schoolId }, attributes: [] }], attributes: ['userId'], raw: true }),
  ]);
  return [...new Set([...roles.map((r) => r.userId as number), ...guardians.map((g) => g.userId as number)])];
};

// GET /school/audit/activity
export const listSchoolActivity = asyncHandler(async (req, res) => {
  const filters = req.query as unknown as Filters;
  const where: WhereOptions = { schoolId: req.schoolSession!.schoolId, ...dateRange(filters) };
  if (filters.userId) Object.assign(where, { userId: filters.userId });
  if (filters.ip) Object.assign(where, { ip: { [Op.iLike]: `${filters.ip}%` } });
  if (filters.q) Object.assign(where, { path: { [Op.iLike]: `%${filters.q}%` } });
  const { rows, count } = await ActivityLog.findAndCountAll({
    where,
    include: [userInclude],
    order: [['createdAt', 'DESC']],
    limit: filters.limit,
    offset: (filters.page - 1) * filters.limit,
  });
  res.json(paginated(rows, count, filters));
});

// GET /school/audit/changes — cambios del colegio + ingresos de su gente
export const listSchoolChanges = asyncHandler(async (req, res) => {
  const filters = req.query as unknown as Filters;
  const schoolId = req.schoolSession!.schoolId;
  const userIds = await schoolUserIds(schoolId);
  const where: WhereOptions = {
    [Op.or]: [{ schoolId }, { schoolId: null, entity: 'Session', userId: userIds.length ? userIds : [0] }],
    ...dateRange(filters),
  };
  if (filters.userId) Object.assign(where, { userId: filters.userId });
  if (filters.entity) Object.assign(where, { entity: filters.entity });
  if (filters.action) Object.assign(where, { action: filters.action });
  if (filters.ip) Object.assign(where, { ip: { [Op.iLike]: `${filters.ip}%` } });
  if (filters.q) Object.assign(where, { [Op.and]: [{ [Op.or]: [{ entity: { [Op.iLike]: `%${filters.q}%` } }, { action: { [Op.iLike]: `%${filters.q}%` } }] }] });
  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    include: [userInclude],
    order: [['createdAt', 'DESC']],
    limit: filters.limit,
    offset: (filters.page - 1) * filters.limit,
  });
  res.json(paginated(rows, count, filters));
});

// GET /platform/activity — toda la plataforma (equipo Sentryx), incluidos ingresos fallidos
export const listPlatformActivity = asyncHandler(async (req, res) => {
  const filters = req.query as unknown as Filters;
  const where: WhereOptions = { ...dateRange(filters) };
  if (filters.userId) Object.assign(where, { userId: filters.userId });
  if (filters.schoolId) Object.assign(where, { schoolId: filters.schoolId });
  if (filters.ip) Object.assign(where, { ip: { [Op.iLike]: `${filters.ip}%` } });
  if (filters.q) Object.assign(where, { [Op.or]: [{ entity: { [Op.iLike]: `%${filters.q}%` } }, { action: { [Op.iLike]: `%${filters.q}%` } }] });
  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    include: [userInclude],
    order: [['createdAt', 'DESC']],
    limit: filters.limit,
    offset: (filters.page - 1) * filters.limit,
  });
  const schoolNames = new Map(
    (await School.findAll({ where: { id: [...new Set(rows.map((r) => r.schoolId).filter((id): id is number => !!id))] }, attributes: ['id', 'name'] })).map((s) => [s.id, s.name])
  );
  res.json(paginated(rows.map((row) => ({ ...row.toJSON(), schoolName: row.schoolId ? schoolNames.get(row.schoolId) ?? null : null })), count, filters));
});
