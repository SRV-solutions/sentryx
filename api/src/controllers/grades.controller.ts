/** Controlador de grades: la lógica de cada ruta de routes/grades.routes.ts. */
import { z } from 'zod';
import { Grade, GradingPeriod, Subject, Level, Division, Enrollment, Student, TeachingAssignment, ReportCardPublication, StudentGuardian, sequelize } from '../models';
import { asyncHandler, notFound, forbidden, badRequest } from '../lib/http';
import { assertDivision, teaches, assertStudentAccess, divisionWhere, SchoolSession } from '../services/schoolSession';
import { normalizeEntry, isEmpty, buildReportCard, completionFor, isAtRisk } from '../services/grades';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import { Entity, Action } from '../constants/permissions';
import { saveBody, sheetQuery } from '../validators/grades.validator';

const canWrite = (session: SchoolSession, divisionId: number, subjectId: number) =>
  (session.can(Entity.GRADES, Action.UPDATE) && teaches(session, divisionId, subjectId)) ||
  (session.can(Entity.GRADES, Action.UPDATE_ANY) && (session.scope.all || session.scope.divisionIds.includes(divisionId)));

/**
 * Panel "Mis materias": todas las asignaciones del docente (o del alcance, para directivos)
 * con el avance de carga por período.
 */
// GET /my-subjects
export const listMySubjects = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    if (!session.academicYearId) return res.json([]);
    const mineOnly = req.query.all !== 'true' || !session.can(Entity.GRADES, Action.READ);
    const assignments = await TeachingAssignment.findAll({
      where: mineOnly ? { teacherId: session.userId, schoolId: session.schoolId } : { schoolId: session.schoolId },
      include: [
        { model: Division, where: { ...divisionWhere(session), academicYearId: session.academicYearId }, include: [{ model: Level, attributes: ['id', 'name', 'type'] }] },
        { model: Subject, attributes: ['id', 'name'] },
      ],
      order: [[Division, 'name', 'ASC'], [Subject, 'name', 'ASC']],
    });
    const divisionIds = [...new Set(assignments.map((a) => a.divisionId as number))];
    const [completion, periods] = await Promise.all([
      completionFor(divisionIds, session.academicYearId),
      GradingPeriod.findAll({ where: { schoolId: session.schoolId, academicYearId: session.academicYearId }, order: [['order', 'ASC']] }),
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
            const c = completion.loaded.find((x) => x.divisionId === a.divisionId && x.subjectId === a.subjectId && x.periodId === p.id);
            return { id: p.id, name: p.name, kind: p.kind, closed: !!p.closedAt, loaded: c?.n ?? 0, students: completion.students.get(a.divisionId as number) ?? 0 };
          }),
        };
      })
    );
  });

/** Planilla de calificaciones de una materia en una división (todos los períodos). */
// GET /sheet
export const getGradeSheet = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { divisionId, subjectId } = req.query as unknown as z.infer<typeof sheetQuery>;
    const mine = teaches(session, divisionId, subjectId);
    if (!mine) {
      if (!session.can(Entity.GRADES, Action.READ)) throw forbidden();
      assertDivision(session, divisionId);
    }
    const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, include: [Level] });
    const subject = await Subject.findOne({ where: { id: subjectId, schoolId: session.schoolId } });
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
      canEdit: canWrite(session, divisionId, subjectId),
      canEditClosed: session.can(Entity.GRADES, Action.UPDATE_ANY),
    });
  });

/** Guarda en bloque (una transacción) las notas de un período. Valida escala según nivel y deja auditoría. */
// PUT /sheet
export const saveGradeSheet = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { divisionId, subjectId, periodId, entries } = req.body as z.infer<typeof saveBody>;
    if (!canWrite(session, divisionId, subjectId)) throw forbidden('No dictás esta materia en esta división.');

    const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, include: [Level] });
    const period = await GradingPeriod.findOne({ where: { id: periodId, schoolId: session.schoolId } });
    if (!division || !period || period.levelId !== division.levelId) throw badRequest('Período inválido para esta división.');
    if (period.closedAt && !session.can(Entity.GRADES, Action.UPDATE_ANY)) throw forbidden('El período está cerrado. Pedile a dirección que lo reabra.');

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
            await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Grade', entityId: current.id, action: 'delete', before: current.toJSON() }, transaction);
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
          await current.update({ ...values, observation, updatedById: session.userId }, { transaction });
          await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Grade', entityId: current.id, action: 'update', before, after: current.toJSON() }, transaction);
        } else {
          const g = await Grade.create(
            { ...values, observation, schoolId: session.schoolId, studentId: entry.studentId, subjectId, divisionId, periodId, updatedById: session.userId },
            { transaction }
          );
          await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Grade', entityId: g.id, action: 'create', after: g.toJSON() }, transaction);
        }
        count++;
      }
      return count;
    });
    res.json({ saved });
  });

/** Boletín de un alumno. Las familias solo ven períodos publicados. */
// GET /report-card/:id
export const getReportCard = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const studentId = Number(req.params.id);
    const { asGuardian } = await assertStudentAccess(session, studentId);
    if (!asGuardian && !session.can(Entity.GRADES, Action.READ) && !session.can(Entity.GRADES, Action.UPDATE)) throw forbidden();
    if (!session.academicYearId) throw notFound('No hay ciclo lectivo activo.');
    const student = await Student.findByPk(studentId, { attributes: ['id', 'firstName', 'lastName', 'dni'] });

    const onlyPublished = asGuardian || !session.can(Entity.GRADES, Action.READ);
    const report = await buildReportCard({ studentId, academicYearId: session.academicYearId, onlyPublished });
    if (!report) throw notFound('El alumno no está inscripto en el ciclo actual.');
    res.json({ student, ...report });
  });

/** Estado académico de una división: alumnos con materias en riesgo (para docentes y conducción). */
// GET /division-status/:id
export const getDivisionStatus = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const divisionId = Number(req.params.id);
    assertDivision(session, divisionId);
    const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, include: [Level] });
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
  });

/** Publica el boletín de un período para una división y avisa a las familias. */
// POST /publish
export const publishReportCards = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { divisionId, periodId, notifyFamilies } = req.body;
    assertDivision(session, divisionId);
    const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId } });
    const period = await GradingPeriod.findOne({ where: { id: periodId, schoolId: session.schoolId } });
    if (!division || !period || period.levelId !== division.levelId) throw badRequest('Período inválido para esta división.');

    const [pub, created] = await ReportCardPublication.findOrCreate({
      where: { divisionId, periodId },
      defaults: { divisionId, periodId, schoolId: session.schoolId, publishedById: session.userId },
    });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'ReportCardPublication', entityId: pub.id, action: 'publish', after: { divisionId, periodId } });

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
  });

// DELETE /publish
export const unpublishReportCards = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    assertDivision(session, req.body.divisionId);
    await ReportCardPublication.destroy({ where: { ...req.body, schoolId: session.schoolId } });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'ReportCardPublication', action: 'unpublish', before: req.body });
    res.status(204).end();
  });
