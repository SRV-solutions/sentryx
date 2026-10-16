import { Router } from 'express';
import { z } from 'zod';
import { Op } from 'sequelize';
import {
  Attendance,
  AttendanceRule,
  Alert,
  Division,
  Enrollment,
  Student,
  Level,
  AcademicYear,
  User,
  sequelize,
} from '../../models';
import { asyncHandler, validate, idParam, notFound, badRequest } from '../../lib/http';
import { requirePerm, assertDivision, assertStudentAccess, divisionWhere, SchoolContext } from '../context';
import { ATTENDANCE_STATUSES, ALERT_RULE_TYPES, SEVERITIES } from '../constants';
import { evaluateAlerts, evaluateAlertsInBackground } from '../services/alerts';
import { audit } from '../services/audit';

const router = Router();
const today = () => new Date().toISOString().slice(0, 10);

// ======================= ASISTENCIA =======================

/** Lista para tomar asistencia: todos PRESENTE por defecto, se marcan solo las excepciones. */
router.get(
  '/attendance/division/:id',
  requirePerm('attendance.read'),
  validate({ params: idParam, query: z.object({ date: z.string().date().default(today) }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const divisionId = Number(req.params.id);
    const { date } = req.query as { date: string };
    assertDivision(ctx, divisionId);
    const division = await Division.findOne({ where: { id: divisionId, schoolId: ctx.schoolId }, include: [Level] });
    if (!division) throw notFound();

    const [enrollments, records] = await Promise.all([
      Enrollment.findAll({
        where: { divisionId, status: 'ACTIVE' },
        include: [{ model: Student, attributes: ['id', 'firstName', 'lastName', 'photoUrl'], where: { active: true } }],
        order: [[Student, 'lastName', 'ASC'], [Student, 'firstName', 'ASC']],
      }),
      Attendance.findAll({ where: { divisionId, date } }),
    ]);
    const byStudent = new Map(records.map((r) => [r.studentId as number, r]));
    res.json({
      division: { id: division.id, name: division.name },
      date,
      taken: records.length > 0,
      weights: division.Level!.settings.attendanceWeights,
      students: enrollments.map((e) => {
        const r = byStudent.get(e.Student!.id);
        return {
          student: e.Student,
          status: r?.status ?? 'PRESENTE',
          justified: r?.justified ?? false,
          note: r?.note ?? null,
          recordId: r?.id ?? null,
        };
      }),
    });
  })
);

const takeBody = z.object({
  date: z.string().date(),
  records: z
    .array(
      z.object({
        studentId: z.number().int(),
        status: z.enum(ATTENDANCE_STATUSES),
        justified: z.boolean().default(false),
        note: z.string().max(300).nullish(),
      })
    )
    .min(1)
    .max(80),
});

router.put(
  '/attendance/division/:id',
  requirePerm('attendance.write'),
  validate({ params: idParam, body: takeBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const divisionId = Number(req.params.id);
    const { date, records } = req.body as z.infer<typeof takeBody>;
    assertDivision(ctx, divisionId);
    if (date > today()) throw badRequest('No se puede cargar asistencia de días futuros.');

    const division = await Division.findOne({ where: { id: divisionId, schoolId: ctx.schoolId }, include: [Level] });
    if (!division) throw notFound();
    const enrolled = new Set(
      (await Enrollment.findAll({ where: { divisionId, status: 'ACTIVE' }, attributes: ['studentId'], raw: true })).map((e) => e.studentId)
    );
    const weights = division.Level!.settings.attendanceWeights;

    await sequelize.transaction(async (transaction) => {
      const rows = records.map((r) => {
        if (!enrolled.has(r.studentId)) throw badRequest(`El alumno ${r.studentId} no pertenece a la división.`);
        return {
          schoolId: ctx.schoolId,
          studentId: r.studentId,
          divisionId,
          date,
          status: r.status,
          value: r.status === 'PRESENTE' ? 0 : weights[r.status],
          justified: r.status === 'PRESENTE' ? false : r.justified,
          note: r.note ?? null,
          recordedById: ctx.userId,
        };
      });
      // Un solo INSERT ... ON CONFLICT para toda la división.
      await Attendance.bulkCreate(rows, {
        transaction,
        updateOnDuplicate: ['status', 'value', 'justified', 'note', 'recordedById', 'divisionId', 'updatedAt'],
        conflictAttributes: ['studentId', 'date'],
      });
      await audit(
        { schoolId: ctx.schoolId, userId: ctx.userId, entity: 'Attendance', entityId: divisionId, action: 'take', after: { date, absent: rows.filter((r) => r.status !== 'PRESENTE').length } },
        transaction
      );
    });

    evaluateAlertsInBackground(ctx.schoolId, records.map((r) => r.studentId));
    res.json({ saved: records.length });
  })
);

router.patch(
  '/attendance/:id',
  requirePerm('attendance.write'),
  validate({ params: idParam, body: z.object({ justified: z.boolean(), note: z.string().max(300).nullish() }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const record = await Attendance.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!record) throw notFound();
    assertDivision(ctx, record.divisionId as number);
    const before = record.toJSON();
    await record.update({ justified: req.body.justified, note: req.body.note ?? record.note, recordedById: ctx.userId });
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'Attendance', entityId: record.id, action: 'justify', before, after: record.toJSON() });
    evaluateAlertsInBackground(ctx.schoolId, [record.studentId as number]);
    res.json(record);
  })
);

const summarize = (records: Attendance[]) => {
  const absences = records.filter((r) => r.status !== 'PRESENTE');
  const total = absences.reduce((s, r) => s + r.value, 0);
  return {
    days: records.length,
    total: Math.round(total * 100) / 100,
    unjustified: Math.round(absences.filter((r) => !r.justified).reduce((s, r) => s + r.value, 0) * 100) / 100,
    byStatus: Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, records.filter((r) => r.status === s).length])),
    percent: records.length ? Math.round((1 - total / records.length) * 1000) / 10 : 100,
  };
};

/** Asistencia de un alumno (familia o personal con alcance). */
router.get(
  '/attendance/student/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const studentId = Number(req.params.id);
    await assertStudentAccess(ctx, studentId);
    const year = ctx.academicYearId ? await AcademicYear.findByPk(ctx.academicYearId) : null;
    if (!year) return res.json({ summary: summarize([]), records: [] });
    const records = await Attendance.findAll({
      where: { studentId, date: { [Op.between]: [year.startDate, year.endDate] } },
      attributes: ['id', 'date', 'status', 'value', 'justified', 'note'],
      order: [['date', 'DESC']],
    });
    res.json({ summary: summarize(records), records: records.filter((r) => r.status !== 'PRESENTE') });
  })
);

/** Resumen por alumno de una división (para preceptoría/docentes). Una sola consulta agregada. */
router.get(
  '/attendance/summary/:id',
  requirePerm('attendance.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const divisionId = Number(req.params.id);
    assertDivision(ctx, divisionId);
    const rows = (await Attendance.findAll({
      where: { divisionId },
      attributes: [
        'studentId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'days'],
        [sequelize.fn('SUM', sequelize.col('value')), 'total'],
        [sequelize.literal(`SUM(CASE WHEN justified THEN 0 ELSE value END)`), 'unjustified'],
      ],
      group: ['studentId'],
      raw: true,
    })) as unknown as Array<{ studentId: number; days: string; total: string; unjustified: string }>;
    res.json(
      rows.map((r) => ({
        studentId: r.studentId,
        days: Number(r.days),
        total: Number(r.total),
        unjustified: Number(r.unjustified),
        percent: Number(r.days) ? Math.round((1 - Number(r.total) / Number(r.days)) * 1000) / 10 : 100,
      }))
    );
  })
);

/** Estado del día: qué divisiones ya tomaron asistencia y cuántos ausentes hay (preceptoría/conducción). */
router.get(
  '/attendance/today',
  requirePerm('attendance.read'),
  validate({ query: z.object({ date: z.string().date().default(today) }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { date } = req.query as { date: string };
    if (!ctx.academicYearId) return res.json([]);
    const divisions = await Division.findAll({
      where: { ...divisionWhere(ctx), academicYearId: ctx.academicYearId },
      attributes: ['id', 'name', 'levelId'],
      order: [['levelId', 'ASC'], ['gradeYear', 'ASC'], ['name', 'ASC']],
    });
    const stats = (await Attendance.findAll({
      where: { date, divisionId: divisions.map((d) => d.id) },
      attributes: ['divisionId', [sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.literal(`SUM(CASE WHEN status <> 'PRESENTE' THEN 1 ELSE 0 END)`), 'absent']],
      group: ['divisionId'],
      raw: true,
    })) as unknown as Array<{ divisionId: number; n: string; absent: string }>;
    res.json(
      divisions.map((d) => {
        const s = stats.find((x) => x.divisionId === d.id);
        return { division: d, taken: !!s, recorded: Number(s?.n ?? 0), absent: Number(s?.absent ?? 0) };
      })
    );
  })
);

// ======================= ALERTAS =======================

const alertScopeWhere = async (ctx: SchoolContext) => {
  if (ctx.scope.all) return {};
  const ids = (await Enrollment.findAll({ where: { divisionId: ctx.scope.divisionIds, status: 'ACTIVE' }, attributes: ['studentId'], raw: true })).map((e) => e.studentId);
  return { studentId: ids };
};

router.get(
  '/alerts',
  requirePerm('alerts.read'),
  validate({
    query: z.object({
      status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ACTIVE']).default('ACTIVE'),
      severity: z.enum(SEVERITIES).optional(),
      divisionId: z.coerce.number().int().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { status, severity, divisionId } = req.query as unknown as { status: string; severity?: string; divisionId?: number };
    if (divisionId) assertDivision(ctx, divisionId);
    const alerts = await Alert.findAll({
      where: {
        schoolId: ctx.schoolId,
        ...(await alertScopeWhere(ctx)),
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
              where: { academicYearId: ctx.academicYearId ?? 0, status: 'ACTIVE', ...(divisionId ? { divisionId } : {}) },
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
  })
);

router.patch(
  '/alerts/:id',
  requirePerm('alerts.manage'),
  validate({ params: idParam, body: z.object({ status: z.enum(['ACKNOWLEDGED', 'RESOLVED', 'OPEN']), note: z.string().max(500).nullish() }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const alert = await Alert.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId, ...(await alertScopeWhere(ctx)) } });
    if (!alert) throw notFound();
    await alert.update({ status: req.body.status, note: req.body.note ?? alert.note, handledById: ctx.userId, handledAt: new Date() });
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'Alert', entityId: alert.id, action: req.body.status.toLowerCase() });
    res.json(alert);
  })
);

// ----- Reglas (la normativa se carga acá) -----
const ruleBody = z
  .object({
    name: z.string().min(3).max(120),
    levelId: z.number().int().nullish(),
    type: z.enum(ALERT_RULE_TYPES),
    threshold: z.number().positive().max(1000),
    windowDays: z.number().int().min(1).max(365).nullish(),
    countJustified: z.boolean().default(true),
    severity: z.enum(SEVERITIES),
    notifyGuardians: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((r) => r.type !== 'WINDOW' || r.windowDays, { message: 'Indicá la cantidad de días de la ventana.', path: ['windowDays'] })
  .refine((r) => r.type !== 'PERCENT' || r.threshold <= 100, { message: 'El porcentaje debe ser ≤ 100.', path: ['threshold'] });

router.get(
  '/alerts/rules',
  requirePerm('alerts.read'),
  asyncHandler(async (req, res) => {
    res.json(await AttendanceRule.findAll({ where: { schoolId: req.school!.schoolId }, include: [{ model: Level, attributes: ['id', 'name'] }], order: [['id', 'ASC']] }));
  })
);

router.post(
  '/alerts/rules',
  requirePerm('alerts.rules'),
  validate({ body: ruleBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const rule = await AttendanceRule.create({ ...req.body, levelId: req.body.levelId ?? null, windowDays: req.body.windowDays ?? null, schoolId: ctx.schoolId });
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'AttendanceRule', entityId: rule.id, action: 'create', after: rule.toJSON() });
    res.status(201).json(rule);
  })
);

router.patch(
  '/alerts/rules/:id',
  requirePerm('alerts.rules'),
  validate({ params: idParam, body: z.object({}).passthrough() }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const rule = await AttendanceRule.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!rule) throw notFound();
    const data = ruleBody.parse({ ...rule.toJSON(), ...req.body });
    const before = rule.toJSON();
    await rule.update({ ...data, levelId: data.levelId ?? null, windowDays: data.windowDays ?? null });
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'AttendanceRule', entityId: rule.id, action: 'update', before, after: rule.toJSON() });
    res.json(rule);
  })
);

router.delete(
  '/alerts/rules/:id',
  requirePerm('alerts.rules'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    // Se desactiva en lugar de borrar: las alertas históricas siguen referenciándola.
    await AttendanceRule.update({ active: false }, { where: { id: req.params.id, schoolId: ctx.schoolId } });
    res.status(204).end();
  })
);

/** Reevalúa toda la escuela (después de cambiar reglas). */
router.post(
  '/alerts/recompute',
  requirePerm('alerts.rules'),
  asyncHandler(async (req, res) => {
    res.json(await evaluateAlerts(req.school!.schoolId));
  })
);

export default router;
