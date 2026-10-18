/** Controlador de alerts: la lógica de cada ruta de routes/alerts.routes.ts. */
import { Op } from 'sequelize';
import { AttendanceRule, Alert, Division, Enrollment, Student, Level, User, sequelize } from '../models';
import { asyncHandler, notFound } from '../lib/http';
import { assertDivision, SchoolSession } from '../services/schoolSession';
import { evaluateAlerts } from '../services/alerts';
import { audit } from '../services/audit';
import { ruleBody } from '../validators/attendance.validator';

// ======================= ALERTAS =======================

const alertScopeWhere = async (session: SchoolSession) => {
  if (session.scope.all) return {};
  const ids = (await Enrollment.findAll({ where: { divisionId: session.scope.divisionIds, status: 'ACTIVE' }, attributes: ['studentId'], raw: true })).map((e) => e.studentId);
  return { studentId: ids };
};

// GET /alerts
export const listAlerts = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { status, severity, divisionId } = req.query as unknown as { status: string; severity?: string; divisionId?: number };
    if (divisionId) assertDivision(session, divisionId);
    const alerts = await Alert.findAll({
      where: {
        schoolId: session.schoolId,
        ...(await alertScopeWhere(session)),
        status: status === 'ACTIVE' ? { [Op.ne]: 'RESOLVED' } : status,
        ...(severity ? { severity } : {}),
      },
      include: [
        {
          model: Student,
          attributes: ['id', 'firstName', 'lastName'],
          include: [
            {
              model: Enrollment,
              where: { academicYearId: session.academicYearId ?? 0, status: 'ACTIVE', ...(divisionId ? { divisionId } : {}) },
              required: !!divisionId,
              attributes: ['divisionId'],
              include: [{ model: Division, attributes: ['id', 'name'] }],
            },
          ],
        },
        { model: AttendanceRule, attributes: ['id', 'name', 'type'] },
        { model: User, as: 'HandledBy', attributes: ['id', 'firstName', 'lastName'] },
      ],
      order: [
        [sequelize.literal(`CASE "Alert"."severity" WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END`), 'ASC'],
        ['updatedAt', 'DESC'],
      ],
      limit: 300,
    });
    res.json(alerts);
  });

// PATCH /alerts/:id
export const updateAlert = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const alert = await Alert.findOne({ where: { id: req.params.id, schoolId: session.schoolId, ...(await alertScopeWhere(session)) } });
    if (!alert) throw notFound();
    await alert.update({ status: req.body.status, note: req.body.note ?? alert.note, handledById: session.userId, handledAt: new Date() });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Alert', entityId: alert.id, action: req.body.status.toLowerCase() });
    res.json(alert);
  });

// GET /alerts/rules
export const listRules = asyncHandler(async (req, res) => {
    res.json(await AttendanceRule.findAll({ where: { schoolId: req.schoolSession!.schoolId }, include: [{ model: Level, attributes: ['id', 'name'] }], order: [['id', 'ASC']] }));
  });

// POST /alerts/rules
export const createRule = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const rule = await AttendanceRule.create({ ...req.body, levelId: req.body.levelId ?? null, windowDays: req.body.windowDays ?? null, schoolId: session.schoolId });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'AttendanceRule', entityId: rule.id, action: 'create', after: rule.toJSON() });
    res.status(201).json(rule);
  });

// PATCH /alerts/rules/:id
export const updateRule = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const rule = await AttendanceRule.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!rule) throw notFound();
    const data = ruleBody.parse({ ...rule.toJSON(), ...req.body });
    const before = rule.toJSON();
    await rule.update({ ...data, levelId: data.levelId ?? null, windowDays: data.windowDays ?? null });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'AttendanceRule', entityId: rule.id, action: 'update', before, after: rule.toJSON() });
    res.json(rule);
  });

// DELETE /alerts/rules/:id
export const deleteRule = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;

    await AttendanceRule.update({ active: false }, { where: { id: req.params.id, schoolId: session.schoolId } });
    res.status(204).end();
  });

/** Reevalúa toda la escuela (después de cambiar reglas). */
// POST /alerts/recompute
export const recomputeAlerts = asyncHandler(async (req, res) => {
    res.json(await evaluateAlerts(req.schoolSession!.schoolId));
  });
