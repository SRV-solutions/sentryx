import { Router } from 'express';
import { z } from 'zod';
import {
  Grade,
  GradingPeriod,
  Subject,
  Level,
  Division,
  Enrollment,
  Student,
  TeachingAssignment,
  ReportCardPublication,
  StudentGuardian,
  sequelize,
} from '../../models';
import { asyncHandler, validate, idParam, notFound, forbidden, badRequest } from '../../lib/http';
import { requirePerm, assertDivision, teaches, assertStudentAccess, divisionWhere, SchoolContext } from '../context';
import { normalizeEntry, isEmpty, buildReportCard, completionFor, isAtRisk } from '../services/grades';
import { audit } from '../services/audit';
import { notify } from '../../lib/notify';

const router = Router();

/**
 * Panel "Mis materias": todas las asignaciones del docente (o del alcance, para directivos)
 * con el avance de carga por período.
 */
router.get(
  '/my-subjects',
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    if (!ctx.academicYearId) return res.json([]);
    const mineOnly = req.query.all !== 'true' || !ctx.permissions.has('grades.read');
    const assignments = await TeachingAssignment.findAll({
      where: mineOnly ? { teacherId: ctx.userId, schoolId: ctx.schoolId } : { schoolId: ctx.schoolId },
      include: [
        { model: Division, where: { ...divisionWhere(ctx), academicYearId: ctx.academicYearId }, include: [{ model: Level, attributes: ['id', 'name', 'type'] }] },
        { model: Subject, attributes: ['id', 'name'] },
      ],
      order: [[Division, 'name', 'ASC'], [Subject, 'name', 'ASC']],
    });
    const divisionIds = [...new Set(assignments.map((a) => a.divisionId as number))];
    const [completion, periods] = await Promise.all([
      completionFor(divisionIds, ctx.academicYearId),
      GradingPeriod.findAll({ where: { schoolId: ctx.schoolId, academicYearId: ctx.academicYearId }, order: [['order', 'ASC']] }),
    ]);
    res.json(
      assignments.map((a) => {
        const levelPeriods = periods.filter((p) => p.levelId === a.Division!.levelId);
        return {
          id: a.id,
          division: { id: a.Division!.id, name: a.Division!.name },
          level: a.Division!.Level,
          subject: a.Subject,
          periods: levelPeriods.map((p) => {
            const c = completion.find((x) => x.divisionId === a.divisionId && x.subjectId === a.subjectId && x.periodId === p.id);
            return { id: p.id, name: p.name, kind: p.kind, closed: !!p.closedAt, loaded: c?.n ?? 0, students: c?.students ?? 0 };
          }),
        };
      })
    );
  })
);

const canWrite = (ctx: SchoolContext, divisionId: number, subjectId: number) =>
  (ctx.permissions.has('grades.write') && teaches(ctx, divisionId, subjectId)) ||
  (ctx.permissions.has('grades.write.any') && (ctx.scope.all || ctx.scope.divisionIds.includes(divisionId)));

const sheetQuery = z.object({ divisionId: z.coerce.number().int(), subjectId: z.coerce.number().int() });

/** Planilla de calificaciones de una materia en una división (todos los períodos). */
router.get(
  '/sheet',
  validate({ query: sheetQuery }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { divisionId, subjectId } = req.query as unknown as z.infer<typeof sheetQuery>;
    const mine = teaches(ctx, divisionId, subjectId);
    if (!mine) {
      if (!ctx.permissions.has('grades.read')) throw forbidden();
      assertDivision(ctx, divisionId);
    }
    const division = await Division.findOne({ where: { id: divisionId, schoolId: ctx.schoolId }, include: [Level] });
    const subject = await Subject.findOne({ where: { id: subjectId, schoolId: ctx.schoolId } });
    if (!division || !subject) throw notFound();

    const [periods, enrollments, grades, publications] = await Promise.all([
      GradingPeriod.findAll({ where: { levelId: division.levelId, academicYearId: division.academicYearId }, order: [['order', 'ASC']] }),
      Enrollment.findAll({
        where: { divisionId, status: 'ACTIVE' },
        include: [{ model: Student, attributes: ['id', 'firstName', 'lastName'], where: { active: true } }],
        order: [[Student, 'lastName', 'ASC'], [Student, 'firstName', 'ASC']],
      }),
      Grade.findAll({ where: { divisionId, subjectId } }),
      ReportCardPublication.findAll({ where: { divisionId }, attributes: ['periodId'], raw: true }),
    ]);
    const published = new Set(publications.map((p) => p.periodId));

    res.json({
      division: { id: division.id, name: division.name },
      subject: { id: subject.id, name: subject.name },
      level: { id: division.Level!.id, name: division.Level!.name, type: division.Level!.type, settings: division.Level!.settings },
      periods: periods.map((p) => ({ id: p.id, name: p.name, groupName: p.groupName, kind: p.kind, closed: !!p.closedAt, published: published.has(p.id) })),
      students: enrollments.map((e) => e.Student),
      grades: grades.map((g) => ({
        studentId: g.studentId,
        periodId: g.periodId,
        numericValue: g.numericValue,
        conceptualValue: g.conceptualValue,
        narrative: g.narrative,
        observation: g.observation,
        updatedAt: g.updatedAt,
      })),
      canEdit: canWrite(ctx, divisionId, subjectId),
      canEditClosed: ctx.permissions.has('grades.write.any'),
    });
  })
);

const saveBody = z.object({
  divisionId: z.number().int(),
  subjectId: z.number().int(),
  periodId: z.number().int(),
  entries: z
    .array(
      z.object({
        studentId: z.number().int(),
        numericValue: z.number().nullish(),
        conceptualValue: z.string().max(40).nullish(),
        narrative: z.string().max(5000).nullish(),
        observation: z.string().max(500).nullish(),
      })
    )
    .min(1)
    .max(80),
});

/** Guarda en bloque (una transacción) las notas de un período. Valida escala según nivel y deja auditoría. */
router.put(
  '/sheet',
  validate({ body: saveBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { divisionId, subjectId, periodId, entries } = req.body as z.infer<typeof saveBody>;
    if (!canWrite(ctx, divisionId, subjectId)) throw forbidden('No dictás esta materia en esta división.');

    const division = await Division.findOne({ where: { id: divisionId, schoolId: ctx.schoolId }, include: [Level] });
    const period = await GradingPeriod.findOne({ where: { id: periodId, schoolId: ctx.schoolId } });
    if (!division || !period || period.levelId !== division.levelId) throw badRequest('Período inválido para esta división.');
    if (period.closedAt && !ctx.permissions.has('grades.write.any')) throw forbidden('El período está cerrado. Pedile a dirección que lo reabra.');

    const enrolled = new Set(
      (await Enrollment.findAll({ where: { divisionId, status: 'ACTIVE' }, attributes: ['studentId'], raw: true })).map((e) => e.studentId)
    );
    const settings = division.Level!.settings;

    const saved = await sequelize.transaction(async (transaction) => {
      const existing = await Grade.findAll({ where: { divisionId, subjectId, periodId }, transaction });
      const byStudent = new Map(existing.map((g) => [g.studentId as number, g]));
      let count = 0;
      for (const entry of entries) {
        if (!enrolled.has(entry.studentId)) throw badRequest(`El alumno ${entry.studentId} no pertenece a la división.`);
        const values = normalizeEntry(entry, period.kind, settings);
        const observation = entry.observation?.trim() || null;
        const current = byStudent.get(entry.studentId);

        if (isEmpty(values) && !observation) {
          if (current) {
            await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'Grade', entityId: current.id, action: 'delete', before: current.toJSON() }, transaction);
            await current.destroy({ transaction });
            count++;
          }
          continue;
        }
        if (current) {
          const changed =
            current.numericValue !== values.numericValue ||
            current.conceptualValue !== values.conceptualValue ||
            current.narrative !== values.narrative ||
            current.observation !== observation;
          if (!changed) continue;
          const before = current.toJSON();
          await current.update({ ...values, observation, updatedById: ctx.userId }, { transaction });
          await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'Grade', entityId: current.id, action: 'update', before, after: current.toJSON() }, transaction);
        } else {
          const g = await Grade.create(
            { ...values, observation, schoolId: ctx.schoolId, studentId: entry.studentId, subjectId, divisionId, periodId, updatedById: ctx.userId },
            { transaction }
          );
          await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'Grade', entityId: g.id, action: 'create', after: g.toJSON() }, transaction);
        }
        count++;
      }
      return count;
    });
    res.json({ saved });
  })
);

/** Boletín de un alumno. Las familias solo ven períodos publicados. */
router.get(
  '/report-card/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const studentId = Number(req.params.id);
    const { asGuardian } = await assertStudentAccess(ctx, studentId);
    if (!asGuardian && !ctx.permissions.has('grades.read') && !ctx.permissions.has('grades.write')) throw forbidden();
    if (!ctx.academicYearId) throw notFound('No hay ciclo lectivo activo.');
    const student = await Student.findByPk(studentId, { attributes: ['id', 'firstName', 'lastName', 'dni'] });
    const report = await buildReportCard({ studentId, academicYearId: ctx.academicYearId, onlyPublished: asGuardian });
    if (!report) throw notFound('El alumno no está inscripto en el ciclo actual.');
    res.json({ student, ...report });
  })
);

/** Estado académico de una división: alumnos con materias en riesgo (para docentes y conducción). */
router.get(
  '/division-status/:id',
  requirePerm('grades.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const divisionId = Number(req.params.id);
    assertDivision(ctx, divisionId);
    const division = await Division.findOne({ where: { id: divisionId, schoolId: ctx.schoolId }, include: [Level] });
    if (!division) throw notFound();
    const [enrollments, grades, periods] = await Promise.all([
      Enrollment.findAll({
        where: { divisionId, status: 'ACTIVE' },
        include: [{ model: Student, attributes: ['id', 'firstName', 'lastName'] }],
        order: [[Student, 'lastName', 'ASC']],
      }),
      Grade.findAll({ where: { divisionId }, include: [{ model: Subject, attributes: ['id', 'name'] }] }),
      GradingPeriod.findAll({ where: { levelId: division.levelId, academicYearId: division.academicYearId }, order: [['order', 'ASC']] }),
    ]);
    const order = new Map(periods.map((p) => [p.id, p.order]));
    const settings = division.Level!.settings;

    const students = enrollments.map((e) => {
      const mine = grades.filter((g) => g.studentId === e.Student!.id);
      // Última nota cargada por materia.
      const latest = new Map<number, Grade>();
      for (const g of mine) {
        const prev = latest.get(g.subjectId as number);
        if (!prev || (order.get(g.periodId as number) ?? 0) > (order.get(prev.periodId as number) ?? 0)) latest.set(g.subjectId as number, g);
      }
      const atRisk = [...latest.values()].filter((g) => isAtRisk(g, settings)).map((g) => (g as Grade & { Subject?: Subject }).Subject?.name ?? '');
      const numerics = mine.map((g) => g.numericValue).filter((v): v is number => v !== null);
      return {
        student: e.Student,
        average: numerics.length ? Math.round((numerics.reduce((a, b) => a + b, 0) / numerics.length) * 100) / 100 : null,
        subjectsAtRisk: atRisk,
        status: atRisk.length >= 3 ? 'CRITICAL' : atRisk.length ? 'WARNING' : 'OK',
      };
    });
    res.json({ division: { id: division.id, name: division.name }, students });
  })
);

/** Publica el boletín de un período para una división y avisa a las familias. */
router.post(
  '/publish',
  requirePerm('reportcards.publish'),
  validate({ body: z.object({ divisionId: z.number().int(), periodId: z.number().int(), notifyFamilies: z.boolean().default(true) }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { divisionId, periodId, notifyFamilies } = req.body;
    assertDivision(ctx, divisionId);
    const division = await Division.findOne({ where: { id: divisionId, schoolId: ctx.schoolId } });
    const period = await GradingPeriod.findOne({ where: { id: periodId, schoolId: ctx.schoolId } });
    if (!division || !period || period.levelId !== division.levelId) throw badRequest('Período inválido para esta división.');

    const [pub, created] = await ReportCardPublication.findOrCreate({
      where: { divisionId, periodId },
      defaults: { divisionId, periodId, schoolId: ctx.schoolId, publishedById: ctx.userId },
    });
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'ReportCardPublication', entityId: pub.id, action: 'publish', after: { divisionId, periodId } });

    if (created && notifyFamilies) {
      const guardians = await StudentGuardian.findAll({
        where: { receivesCommunications: true },
        include: [{ model: Student, required: true, include: [{ model: Enrollment, where: { divisionId, status: 'ACTIVE' }, attributes: [] }], attributes: [] }],
        attributes: ['userId'],
        raw: true,
      });
      notify({
        userIds: guardians.map((g) => g.userId as number),
        title: `Boletín disponible · ${period.name}`,
        message: `Ya podés ver las calificaciones de ${period.name} de ${division.name}.`,
        type: 'reportcard',
        link: '/familia',
      });
    }
    res.status(created ? 201 : 200).json(pub);
  })
);

router.delete(
  '/publish',
  requirePerm('reportcards.publish'),
  validate({ body: z.object({ divisionId: z.number().int(), periodId: z.number().int() }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    assertDivision(ctx, req.body.divisionId);
    await ReportCardPublication.destroy({ where: { ...req.body, schoolId: ctx.schoolId } });
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'ReportCardPublication', action: 'unpublish', before: req.body });
    res.status(204).end();
  })
);

export default router;
