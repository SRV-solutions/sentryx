/** Controlador de attendance: la lógica de cada ruta de routes/attendance.routes.ts. */
import { z } from 'zod';
import { Op } from 'sequelize';
import { Attendance, Division, Enrollment, Student, Level, AcademicYear, sequelize } from '../models';
import { asyncHandler, notFound, badRequest } from '../lib/http';
import { assertDivision, assertStudentAccess, divisionWhere } from '../services/schoolSession';
import { ATTENDANCE_STATUSES } from '../constants/school';
import { evaluateAlertsInBackground } from '../services/alerts';
import { audit } from '../services/audit';
import { takeBody, today } from '../validators/attendance.validator';

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

// ======================= ASISTENCIA =======================

/** Lista para tomar asistencia: todos PRESENTE por defecto, se marcan solo las excepciones. */
// GET /attendance/division/:id
export const getDivisionDay = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const divisionId = Number(req.params.id);
    const { date } = req.query as { date: string };
    assertDivision(session, divisionId);
    const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, include: [Level] });
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
  });

// PUT /attendance/division/:id
export const saveDivisionDay = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const divisionId = Number(req.params.id);
    const { date, records } = req.body as z.infer<typeof takeBody>;
    assertDivision(session, divisionId);
    if (date > today()) throw badRequest('No se puede cargar asistencia de días futuros.');

    const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, include: [Level] });
    if (!division) throw notFound();
    const enrolled = new Set(
      (await Enrollment.findAll({ where: { divisionId, status: 'ACTIVE' }, attributes: ['studentId'], raw: true })).map((e) => e.studentId)
    );
    const weights = division.Level!.settings.attendanceWeights;

    await sequelize.transaction(async (transaction) => {
      const rows = records.map((r) => {
        if (!enrolled.has(r.studentId)) throw badRequest(`El alumno ${r.studentId} no pertenece a la división.`);
        return {
          schoolId: session.schoolId,
          studentId: r.studentId,
          divisionId,
          date,
          status: r.status,
          value: r.status === 'PRESENTE' ? 0 : weights[r.status],
          justified: r.status === 'PRESENTE' ? false : r.justified,
          note: r.note ?? null,
          recordedById: session.userId,
        };
      });

      await Attendance.bulkCreate(rows, {
        transaction,
        updateOnDuplicate: ['status', 'value', 'justified', 'note', 'recordedById', 'divisionId', 'updatedAt'],
        conflictAttributes: ['studentId', 'date'],
      });
      await audit(
        { schoolId: session.schoolId, userId: session.userId, entity: 'Attendance', entityId: divisionId, action: 'take', after: { date, absent: rows.filter((r) => r.status !== 'PRESENTE').length } },
        transaction
      );
    });

    evaluateAlertsInBackground(session.schoolId, records.map((r) => r.studentId));
    res.json({ saved: records.length });
  });

// PATCH /attendance/:id
export const updateRecord = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const record = await Attendance.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!record) throw notFound();
    assertDivision(session, record.divisionId as number);
    const before = record.toJSON();
    await record.update({ justified: req.body.justified, note: req.body.note ?? record.note, recordedById: session.userId });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Attendance', entityId: record.id, action: 'justify', before, after: record.toJSON() });
    evaluateAlertsInBackground(session.schoolId, [record.studentId as number]);
    res.json(record);
  });

/** Asistencia de un alumno (familia o personal con alcance). */
// GET /attendance/student/:id
export const getStudentAttendance = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const studentId = Number(req.params.id);
    await assertStudentAccess(session, studentId);
    const year = session.academicYearId ? await AcademicYear.findByPk(session.academicYearId) : null;
    if (!year) return res.json({ summary: summarize([]), records: [] });
    const records = await Attendance.findAll({
      where: { studentId, date: { [Op.between]: [year.startDate, year.endDate] } },
      attributes: ['id', 'date', 'status', 'value', 'justified', 'note'],
      order: [['date', 'DESC']],
    });
    res.json({ summary: summarize(records), records: records.filter((r) => r.status !== 'PRESENTE') });
  });

/** Resumen por alumno de una división (para preceptoría/docentes). Una sola consulta agregada. */
// GET /attendance/summary/:id
export const getDivisionSummary = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const divisionId = Number(req.params.id);
    assertDivision(session, divisionId);
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
  });

/** Estado del día: qué divisiones ya tomaron asistencia y cuántos ausentes hay (preceptoría/conducción). */
// GET /attendance/today
export const getTodayOverview = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { date } = req.query as { date: string };
    if (!session.academicYearId) return res.json([]);
    const divisions = await Division.findAll({
      where: { ...divisionWhere(session), academicYearId: session.academicYearId },
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
  });
