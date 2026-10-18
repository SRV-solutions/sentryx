/** Controlador de dashboard: la lógica de cada ruta de routes/dashboard.routes.ts. */
import { Op, QueryTypes } from 'sequelize';
import { AnnouncementRecipient, Announcement, Alert, Attendance, Division, Student, Enrollment, Level, AcademicYear, ReportCardPublication, sequelize } from '../models';
import { asyncHandler } from '../lib/http';
import { divisionWhere } from '../services/schoolSession';
import { Entity, Action } from '../constants/permissions';

/** Resumen de inicio según rol. Todo en paralelo y con consultas agregadas: pensado para cargar rápido en 3G. */
// GET /dashboard
export const getDashboard = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const today = new Date().toISOString().slice(0, 10);

    const unreadAnnouncements = AnnouncementRecipient.count({
      where: { userId: session.userId, readAt: null },
      include: [{ model: Announcement, where: { schoolId: session.schoolId }, attributes: [] }],
    });
    const pendingAck = AnnouncementRecipient.count({
      where: { userId: session.userId, ackAt: null },
      include: [{ model: Announcement, where: { schoolId: session.schoolId, requiresAck: true }, attributes: [] }],
    });
    const unreadThreads = sequelize
      .query(
        `SELECT COUNT(DISTINCT t.id)::int AS count FROM "ThreadParticipant" p
           JOIN "Thread" t ON t.id = p."threadId" AND t."schoolId" = :sid
           JOIN "ThreadMessage" m ON m."threadId" = t.id AND m."senderId" <> :uid
          WHERE p."userId" = :uid AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")`,
        { replacements: { uid: session.userId, sid: session.schoolId }, type: QueryTypes.SELECT }
      )
      .then((r) => (r[0] as { count: number }).count);

    const result: Record<string, unknown> = {
      unreadAnnouncements: await unreadAnnouncements,
      pendingAck: await pendingAck,
      unreadThreads: await unreadThreads,
    };

    const ownIds = session.isGuardian ? session.childIds : session.self ? [session.self.studentId] : [];
    if (ownIds.length && session.academicYearId) {
      const year = await AcademicYear.findByPk(session.academicYearId);
      const [children, attendance, publications] = await Promise.all([
        Student.findAll({
          where: { id: ownIds },
          attributes: ['id', 'firstName', 'lastName', 'photoUrl'],
          include: [
            {
              model: Enrollment,
              where: { academicYearId: session.academicYearId, status: 'ACTIVE' },
              required: false,
              include: [{ model: Division, attributes: ['id', 'name'], include: [{ model: Level, attributes: ['name', 'type'] }] }],
            },
          ],
        }),
        Attendance.findAll({
          where: { studentId: ownIds, date: { [Op.between]: [year!.startDate, year!.endDate] } },
          attributes: [
            'studentId',
            [sequelize.fn('COUNT', sequelize.col('id')), 'days'],
            [sequelize.fn('SUM', sequelize.col('value')), 'total'],
            [sequelize.literal(`SUM(CASE WHEN date = '${today}' AND status <> 'PRESENTE' THEN 1 ELSE 0 END)`), 'absentToday'],
          ],
          group: ['studentId'],
          raw: true,
        }) as unknown as Promise<Array<{ studentId: number; days: string; total: string; absentToday: string }>>,
        ReportCardPublication.findAll({ attributes: ['divisionId', 'periodId', 'publishedAt'], where: { schoolId: session.schoolId }, order: [['publishedAt', 'DESC']], raw: true }),
      ]);
      const mapped = children.map((c) => {
        const a = attendance.find((x) => x.studentId === c.id);
        const days = Number(a?.days ?? 0);
        const total = Number(a?.total ?? 0);
        const division = c.Enrollments?.[0]?.Division;
        const lastPub = division ? publications.find((p) => p.divisionId === division.id) : undefined;
        return {
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          photoUrl: c.photoUrl,
          division,
          attendance: { days, absences: Math.round(total * 100) / 100, percent: days ? Math.round((1 - total / days) * 1000) / 10 : 100, absentToday: Number(a?.absentToday ?? 0) > 0 },
          lastReportCardAt: lastPub?.publishedAt ?? null,
        };
      });
      if (session.isGuardian) result.children = mapped;
      else result.me = mapped[0] ?? null;
    }

    if (session.isStaff) {
      result.mySubjects = session.teaching.length;
      if (session.can(Entity.ALERTS, Action.READ)) {
        const studentFilter = session.scope.all
          ? {}
          : { studentId: (await Enrollment.findAll({ where: { divisionId: session.scope.divisionIds, status: 'ACTIVE' }, attributes: ['studentId'], raw: true })).map((e) => e.studentId) };
        const rows = (await Alert.findAll({
          where: { schoolId: session.schoolId, status: { [Op.ne]: 'RESOLVED' }, ...studentFilter },
          attributes: ['severity', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
          group: ['severity'],
          raw: true,
        })) as unknown as Array<{ severity: string; n: string }>;
        result.alerts = Object.fromEntries(rows.map((r) => [r.severity, Number(r.n)]));
      }
      if (session.can(Entity.ATTENDANCE, Action.READ) && session.academicYearId) {
        const divisions = await Division.findAll({ where: { ...divisionWhere(session), academicYearId: session.academicYearId }, attributes: ['id'], raw: true });
        const ids = divisions.map((d) => d.id);
        const [stats] = (await sequelize.query(
          `SELECT COUNT(DISTINCT "divisionId")::int AS taken, COALESCE(SUM(CASE WHEN status <> 'PRESENTE' THEN 1 ELSE 0 END), 0)::int AS absent
             FROM "Attendance" WHERE date = :today AND "divisionId" IN (:ids)`,
          { replacements: { today, ids: ids.length ? ids : [0] }, type: QueryTypes.SELECT }
        )) as Array<{ taken: number; absent: number }>;
        result.attendanceToday = { divisions: ids.length, taken: stats.taken, absent: stats.absent };
      }
    }
    res.json(result);
  });
