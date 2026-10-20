/**
 * Panel de conducción (routes/stats.routes.ts → /school/stats): asistencia, inasistencias, llegadas tarde
 * y promedios de notas por curso. Solo lectura, acotado al alcance de quien mira.
 */
import { QueryTypes } from 'sequelize';
import { Division, Level, sequelize } from '../models';
import { asyncHandler, notFound } from '../lib/http';
import { assertDivision, divisionWhere } from '../services/schoolSession';

interface OverviewRow {
  divisionId: number;
  students: number;
  days: number;
  present: number;
  absent: number;
  late: number;
  early: number;
  weighted: number;
  avg: number | null;
  graded: number;
  alerts: number;
}

// GET /stats/overview?levelId=
export const getOverview = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    if (!session.academicYearId) return res.json({ divisions: [] });
    const levelId = Number((req.query as { levelId?: string }).levelId) || null;
    const divisions = await Division.findAll({
      where: { ...divisionWhere(session), academicYearId: session.academicYearId, ...(levelId ? { levelId } : {}) },
      include: [{ model: Level, attributes: ['id', 'name', 'type'] }],
      order: [['levelId', 'ASC'], ['gradeYear', 'ASC'], ['name', 'ASC']],
    });
    if (!divisions.length) return res.json({ divisions: [] });
    const ids = divisions.map((d) => d.id);
    const rows = (await sequelize.query(
      `SELECT d.id AS "divisionId",
              (SELECT COUNT(*)::int FROM "Enrollment" e WHERE e."divisionId" = d.id AND e.status = 'ACTIVE') AS students,
              COALESCE(a.days, 0)::int AS days, COALESCE(a.present, 0)::int AS present, COALESCE(a.absent, 0)::int AS absent,
              COALESCE(a.late, 0)::int AS late, COALESCE(a.early, 0)::int AS early, COALESCE(a.weighted, 0)::float AS weighted,
              g.avg::float AS avg, COALESCE(g.graded, 0)::int AS graded,
              (SELECT COUNT(*)::int FROM "Alert" al JOIN "Enrollment" e2 ON e2."studentId" = al."studentId" AND e2."divisionId" = d.id AND e2.status = 'ACTIVE' WHERE al.status = 'OPEN') AS alerts
         FROM "Division" d
         LEFT JOIN (
           SELECT "divisionId", COUNT(*) AS days,
                  SUM(CASE WHEN status = 'PRESENTE' THEN 1 ELSE 0 END) AS present,
                  SUM(CASE WHEN status = 'AUSENTE' THEN 1 ELSE 0 END) AS absent,
                  SUM(CASE WHEN status = 'TARDE' THEN 1 ELSE 0 END) AS late,
                  SUM(CASE WHEN status = 'RETIRO' THEN 1 ELSE 0 END) AS early,
                  SUM(value) AS weighted
             FROM "Attendance" WHERE "divisionId" IN (:ids) GROUP BY "divisionId"
         ) a ON a."divisionId" = d.id
         LEFT JOIN (
           SELECT gr."divisionId", AVG(gr."numericValue") AS avg, COUNT(gr."numericValue") AS graded
             FROM "Grade" gr WHERE gr."divisionId" IN (:ids) AND gr."numericValue" IS NOT NULL GROUP BY gr."divisionId"
         ) g ON g."divisionId" = d.id
        WHERE d.id IN (:ids)`,
      { replacements: { ids }, type: QueryTypes.SELECT }
    )) as OverviewRow[];
    const byId = new Map(rows.map((r) => [r.divisionId, r]));
    res.json({
      divisions: divisions.map((d) => {
        const r = byId.get(d.id)!;
        const level = (d as Division & { Level?: Level }).Level!;
        return {
          id: d.id,
          name: d.name,
          level: { id: level.id, name: level.name, type: level.type },
          students: r.students,
          attendance: { days: r.days, present: r.present, absent: r.absent, late: r.late, early: r.early, percent: r.days ? Math.round((1 - r.weighted / r.days) * 1000) / 10 : null },
          grades: { average: r.avg === null ? null : Math.round(r.avg * 100) / 100, graded: r.graded },
          alerts: r.alerts,
        };
      }),
    });
  });

// GET /stats/division/:id
export const getDivisionStats = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const divisionId = Number(req.params.id);
    assertDivision(session, divisionId);
    const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, include: [{ model: Level, attributes: ['id', 'name', 'type', 'settings'] }] });
    if (!division) throw notFound();
    const level = (division as Division & { Level?: Level }).Level!;

    const [months, students, bySubject, periods] = await Promise.all([
      sequelize.query(
        `SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                SUM(CASE WHEN status = 'PRESENTE' THEN 1 ELSE 0 END)::int AS present,
                SUM(CASE WHEN status = 'AUSENTE' THEN 1 ELSE 0 END)::int AS absent,
                SUM(CASE WHEN status = 'TARDE' THEN 1 ELSE 0 END)::int AS late,
                SUM(CASE WHEN status = 'RETIRO' THEN 1 ELSE 0 END)::int AS early,
                COUNT(DISTINCT date)::int AS days
           FROM "Attendance" WHERE "divisionId" = :id GROUP BY 1 ORDER BY 1`,
        { replacements: { id: divisionId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT s.id, s."firstName", s."lastName",
                COUNT(a.id)::int AS days,
                SUM(CASE WHEN a.status = 'AUSENTE' THEN 1 ELSE 0 END)::int AS absent,
                SUM(CASE WHEN a.status = 'TARDE' THEN 1 ELSE 0 END)::int AS late,
                SUM(CASE WHEN a.status = 'RETIRO' THEN 1 ELSE 0 END)::int AS early,
                SUM(CASE WHEN a.status <> 'PRESENTE' AND NOT a.justified THEN 1 ELSE 0 END)::int AS unjustified,
                COALESCE(SUM(a.value), 0)::float AS weighted
           FROM "Enrollment" e JOIN "Student" s ON s.id = e."studentId"
           LEFT JOIN "Attendance" a ON a."studentId" = s.id AND a."divisionId" = e."divisionId"
          WHERE e."divisionId" = :id AND e.status = 'ACTIVE'
          GROUP BY s.id ORDER BY absent DESC, late DESC, s."lastName"`,
        { replacements: { id: divisionId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT sub.id AS "subjectId", sub.name AS subject, g."periodId",
                AVG(g."numericValue")::float AS avg, COUNT(g."numericValue")::int AS graded,
                SUM(CASE WHEN g."numericValue" IS NOT NULL AND g."numericValue" < :passing THEN 1 ELSE 0 END)::int AS failing,
                COUNT(g."conceptualValue")::int AS conceptual,
                json_object_agg(COALESCE(g."conceptualValue", '-'), 1) FILTER (WHERE false) AS _unused
           FROM "Grade" g JOIN "Subject" sub ON sub.id = g."subjectId"
          WHERE g."divisionId" = :id GROUP BY sub.id, sub.name, g."periodId" ORDER BY sub.name`,
        { replacements: { id: divisionId, passing: (level.settings as { passingGrade: number }).passingGrade }, type: QueryTypes.SELECT }
      ),
      sequelize.query(`SELECT id, name, "groupName", kind, "order", "summaryOf" FROM "GradingPeriod" WHERE "levelId" = :levelId AND "academicYearId" = :year ORDER BY "order"`, {
        replacements: { levelId: division.levelId, year: division.academicYearId },
        type: QueryTypes.SELECT,
      }),
    ]);
    // Distribución de la escala conceptual por materia y período (Primario).
    const conceptual = (await sequelize.query(
      `SELECT g."subjectId", g."periodId", g."conceptualValue" AS value, COUNT(*)::int AS n
         FROM "Grade" g WHERE g."divisionId" = :id AND g."conceptualValue" IS NOT NULL GROUP BY 1, 2, 3`,
      { replacements: { id: divisionId }, type: QueryTypes.SELECT }
    )) as Array<{ subjectId: number; periodId: number; value: string; n: number }>;
    const totalWeighted = (students as Array<{ weighted: number; days: number }>).reduce((a, s) => ({ weighted: a.weighted + s.weighted, days: a.days + s.days }), { weighted: 0, days: 0 });

    res.json({
      division: { id: division.id, name: division.name },
      level: { id: level.id, name: level.name, type: level.type, settings: level.settings },
      periods,
      attendance: {
        percent: totalWeighted.days ? Math.round((1 - totalWeighted.weighted / totalWeighted.days) * 1000) / 10 : null,
        months,
        students: (students as Array<{ id: number; firstName: string; lastName: string; days: number; absent: number; late: number; early: number; unjustified: number; weighted: number }>).map((s) => ({
          ...s,
          percent: s.days ? Math.round((1 - s.weighted / s.days) * 1000) / 10 : null,
        })),
      },
      grades: {
        subjects: (bySubject as Array<{ subjectId: number; subject: string; periodId: number; avg: number | null; graded: number; failing: number; conceptual: number }>).map(({ subjectId, subject, periodId, avg, graded, failing, conceptual: nConceptual }) => ({
          subjectId,
          subject,
          periodId,
          average: avg === null ? null : Math.round(avg * 100) / 100,
          graded,
          failing,
          conceptual: nConceptual,
          distribution: Object.fromEntries(conceptual.filter((c) => c.subjectId === subjectId && c.periodId === periodId).map((c) => [c.value, c.n])),
        })),
      },
    });
  });
