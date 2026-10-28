/** Controlador de alerts: la lógica de cada ruta de routes/alerts.routes.ts. */
import { Op } from 'sequelize';
import { AttendanceRule, Alert, Division, Enrollment, Student, Level, User, sequelize } from '../models';
import { asyncHandler, notFound } from '../lib/http';
import { assertDivision, SchoolSession } from '../services/schoolSession';
import { evaluateAlerts } from '../services/alerts';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import { listStudentsWithoutEmail, listStudentEmails, EmailStatusFilter } from '../services/studentEmail';
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

// ======================= ESTUDIANTES SIN EMAIL =======================

/** No se repite el aviso a la misma familia antes de una semana (salvo que se fuerce). */
const NOTICE_COOLDOWN_MS = 7 * 86400_000;

// GET /alerts/no-email
export const listNoEmail = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { divisionId, status } = req.query as unknown as { divisionId?: number; status: EmailStatusFilter };
    if (divisionId) assertDivision(session, divisionId);
    const data = await listStudentEmails(session, { divisionId, status });
    res.json({ data, total: data.length });
  });

const DEFAULT_CHANGE_MESSAGE = 'La escuela te pide que revises y actualices el email de tu cuenta: tiene que ser uno propio y real.';

/**
 * La conducción le pide al estudiante que cambie su email (ej: uno inventado). Queda marcado en su perfil hasta
 * que lo cambie (PUT /students/:id/email lo borra) y se le avisa por campana, push y email.
 */
// POST /alerts/student-emails/request-change
export const requestEmailChange = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { studentIds, reason } = req.body as { studentIds: number[]; reason?: string | null };
    const requested = [...new Set(studentIds)];
    // Misma consulta del panel: solo alumnos del alcance (Secundario, ciclo actual) y con cuenta.
    const targets = (await listStudentEmails(session, { studentIds: requested, status: 'all' })).filter((r) => r.userId);
    const skipped = requested.length - targets.length;
    if (!targets.length) return res.json({ requested: 0, skipped });

    const ids = targets.map((t) => t.studentId);
    const why = reason?.trim() || null;
    await sequelize.transaction(async (transaction) => {
      // silent: no toca updatedAt (no es una edición del legajo).
      await Student.update({ emailChangeRequestedAt: new Date(), emailChangeReason: why }, { where: { id: ids, schoolId: session.schoolId }, silent: true, transaction });
      await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Student', action: 'request-email-change', after: { studentIds: ids, reason: why } }, transaction);
    });

    const message = why ? `La escuela te pide que actualices el email de tu cuenta: ${why}` : DEFAULT_CHANGE_MESSAGE;
    for (const t of targets) {
      notify({ userIds: [t.userId!], title: 'Actualizá tu email', message, type: 'account', link: `/familia/${t.studentId}?tab=datos`, email: 'always' });
    }
    res.json({ requested: targets.length, skipped });
  });

/**
 * Avisa a las familias (campana + push + email) y al estudiante (in-app) que la cuenta no tiene email.
 * Se saltean los que no tienen cuenta y los avisados hace menos de 7 días (salvo force).
 */
// POST /alerts/no-email/notify
export const notifyNoEmail = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { studentIds, force } = req.body as { studentIds?: number[]; force: boolean };
    const requested = studentIds ? [...new Set(studentIds)] : undefined;
    const rows = await listStudentsWithoutEmail(session, { studentIds: requested });
    const cutoff = Date.now() - NOTICE_COOLDOWN_MS;
    const targets = rows.filter((r) => r.account === 'NO_EMAIL' && (force || !r.noEmailNoticeAt || new Date(r.noEmailNoticeAt).getTime() < cutoff));
    const skipped = (requested?.length ?? rows.length) - targets.length;
    if (!targets.length) return res.json({ notified: 0, guardians: 0, skipped });

    const ids = targets.map((t) => t.studentId);
    const guardianIds = new Set(targets.flatMap((t) => t.guardians.map((g) => g.userId)));
    // silent: no toca updatedAt (no es una edición del legajo).
    await sequelize.transaction(async (transaction) => {
      await Student.update({ noEmailNoticeAt: new Date() }, { where: { id: ids, schoolId: session.schoolId }, silent: true, transaction });
      await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Student', action: 'no-email-notice', after: { studentIds: ids, guardians: guardianIds.size, force } }, transaction);
    });

    // Un aviso por alumno: cada familia ve el nombre de su hijo/a y el link a su ficha.
    for (const t of targets) {
      const link = `/familia/${t.studentId}?tab=datos`;
      notify({
        userIds: t.guardians.map((g) => g.userId),
        title: `${t.firstName} no tiene email en Sentryx`,
        message: `La cuenta de ${t.firstName} ${t.lastName} (${t.division.name}) no tiene un email cargado: puede cambiar su contraseña, pero si la olvida no va a poder recuperarla. Cargá un email propio de ${t.firstName} desde su ficha (Datos → Cargar email).`,
        type: 'account',
        link,
        email: 'always',
      });
      if (t.userId) {
        notify({
          userIds: [t.userId],
          title: 'Tu cuenta no tiene email',
          message: 'Podés cambiar tu contraseña, pero si la olvidás no vas a poder recuperarla. Cargá tu email desde Mi perfil → Datos.',
          type: 'account',
          link,
          email: 'never',
        });
      }
    }
    res.json({ notified: targets.length, guardians: guardianIds.size, skipped });
  });
