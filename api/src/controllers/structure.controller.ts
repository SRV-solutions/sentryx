/** Controlador de structure: la lógica de cada ruta de routes/structure.routes.ts. */
import { Level, AcademicYear, Division, Subject, TeachingAssignment, GradingPeriod, User, Enrollment, sequelize } from '../models';
import { asyncHandler, notFound, badRequest, forbidden } from '../lib/http';
import { invalidateSchoolSession, divisionWhere } from '../services/schoolSession';
import { DEFAULT_LEVEL_SETTINGS, LevelType } from '../constants/school';
import { ensurePeriods } from '../services/schoolSetup';
import { audit } from '../services/audit';

/** Estructura visible para el usuario: niveles, divisiones (según alcance), materias y períodos del ciclo. */
// GET /structure
export const getStructure = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const [levels, years, divisions, subjects, periods] = await Promise.all([
      Level.findAll({ where: { schoolId: session.schoolId }, order: [['id', 'ASC']] }),
      AcademicYear.findAll({ where: { schoolId: session.schoolId }, order: [['year', 'DESC']] }),
      session.academicYearId
        ? Division.findAll({
            where: { ...divisionWhere(session), academicYearId: session.academicYearId },
            attributes: {
              include: [
                [
                  sequelize.literal(
                    `(SELECT COUNT(*) FROM "Enrollment" e WHERE e."divisionId" = "Division"."id" AND e.status = 'ACTIVE')`
                  ),
                  'studentCount',
                ],
              ],
            },
            include: [
              {
                model: TeachingAssignment,
                include: [{ model: User, as: 'Teacher', attributes: ['id', 'firstName', 'lastName'] }],
              },
            ],
            order: [['levelId', 'ASC'], ['gradeYear', 'ASC'], ['name', 'ASC']],
          })
        : [],
      Subject.findAll({ where: { schoolId: session.schoolId, active: true }, order: [['name', 'ASC']] }),
      session.academicYearId
        ? GradingPeriod.findAll({ where: { schoolId: session.schoolId, academicYearId: session.academicYearId }, order: [['levelId', 'ASC'], ['order', 'ASC']] })
        : [],
    ]);
    res.json({ levels, years, divisions, subjects, periods });
  });

// ----- Niveles -----
// PATCH /levels/:id
export const updateLevel = asyncHandler(async (req, res) => {
    const level = await Level.findOne({ where: { id: req.params.id, schoolId: req.schoolSession!.schoolId } });
    if (!level) throw notFound();
    const before = level.toJSON();
    await level.update(req.body);
    await audit({ schoolId: req.schoolSession!.schoolId, userId: req.user!.id, entity: 'Level', entityId: level.id, action: 'update', before, after: level.toJSON() });
    res.json(level);
  });

// POST /levels
export const createLevel = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const type = req.body.type as LevelType;
    const names: Record<LevelType, string> = { INICIAL: 'Inicial', PRIMARIO: 'Primario', SECUNDARIO: 'Secundario' };
    const level = await Level.create({ schoolId: session.schoolId, type, name: names[type], settings: DEFAULT_LEVEL_SETTINGS[type] });
    if (session.academicYearId) await ensurePeriods(level, (await AcademicYear.findByPk(session.academicYearId))!);
    res.status(201).json(level);
  });

// ----- Ciclos lectivos -----
// POST /years/:id/current
export const setCurrentYear = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const year = await AcademicYear.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!year) throw notFound();
    await sequelize.transaction(async (transaction) => {
      await AcademicYear.update({ isCurrent: false }, { where: { schoolId: session.schoolId }, transaction });
      await year.update({ isCurrent: true }, { transaction });
    });
    invalidateSchoolSession();
    res.json(year);
  });

// POST /divisions
export const createDivision = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    if (!session.academicYearId) throw badRequest('Primero creá el ciclo lectivo.');
    const level = await Level.findOne({ where: { id: req.body.levelId, schoolId: session.schoolId } });
    if (!level) throw notFound('Nivel inexistente.');
    const division = await Division.create({
      ...req.body,
      section: req.body.section ?? null,
      shift: req.body.shift ?? null,
      schoolId: session.schoolId,
      academicYearId: session.academicYearId,
    });
    res.status(201).json(division);
  });

// PATCH /divisions/:id
export const updateDivision = asyncHandler(async (req, res) => {
    const schoolId = req.schoolSession!.schoolId;
    const division = await Division.findOne({ where: { id: req.params.id, schoolId } });
    if (!division) throw notFound();
    // El nivel nuevo (si cambia) tiene que ser de este colegio.
    if (req.body.levelId && !(await Level.count({ where: { id: req.body.levelId, schoolId } }))) throw badRequest('Nivel inválido.');
    const before = division.toJSON();
    await division.update(req.body);
    await audit({ schoolId, userId: req.schoolSession!.userId, entity: 'Division', entityId: division.id, action: 'update', before, after: division.toJSON() });
    res.json(division);
  });

// DELETE /divisions/:id
export const deleteDivision = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (await Enrollment.count({ where: { divisionId: id } })) throw badRequest('La división tiene alumnos (o los tuvo): movelos a otro curso antes de eliminarla.');
    const division = await Division.findOne({ where: { id, schoolId: req.schoolSession!.schoolId } });
    if (!division) throw notFound();
    await division.destroy();
    await audit({ schoolId: req.schoolSession!.schoolId, userId: req.schoolSession!.userId, entity: 'Division', entityId: id, action: 'delete', before: { name: division.name } });
    res.status(204).end();
  });

// POST /subjects
export const createSubject = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    if (!(await Level.count({ where: { id: req.body.levelId, schoolId: session.schoolId } }))) throw notFound('Nivel inexistente.');
    res.status(201).json(
      await Subject.create({ ...req.body, code: req.body.code ?? null, gradeYear: req.body.gradeYear ?? null, schoolId: session.schoolId })
    );
  });

// PATCH /subjects/:id
export const updateSubject = asyncHandler(async (req, res) => {
    const subject = await Subject.findOne({ where: { id: req.params.id, schoolId: req.schoolSession!.schoolId } });
    if (!subject) throw notFound();
    res.json(await subject.update(req.body));
  });

// ----- Asignaciones docentes -----
// POST /assignments
export const assignTeacher = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const [division, subject] = await Promise.all([
      Division.findOne({ where: { id: req.body.divisionId, schoolId: session.schoolId } }),
      Subject.findOne({ where: { id: req.body.subjectId, schoolId: session.schoolId } }),
    ]);
    if (!division || !subject) throw notFound('División o materia inexistente.');
    if (division.levelId !== subject.levelId) throw badRequest('La materia no corresponde al nivel de la división.');
    const [assignment] = await TeachingAssignment.findOrCreate({
      where: { divisionId: division.id, subjectId: subject.id, teacherId: req.body.teacherId },
      defaults: { divisionId: division.id, subjectId: subject.id, teacherId: req.body.teacherId, schoolId: session.schoolId },
    });
    invalidateSchoolSession(req.body.teacherId);
    res.status(201).json(assignment);
  });

// DELETE /assignments/:id
export const removeAssignment = asyncHandler(async (req, res) => {
    const a = await TeachingAssignment.findOne({ where: { id: req.params.id, schoolId: req.schoolSession!.schoolId } });
    if (a) {
      await a.destroy();
      invalidateSchoolSession(a.teacherId as number);
    }
    res.status(204).end();
  });

// ----- Períodos -----
// PATCH /periods/:id
export const updatePeriod = asyncHandler(async (req, res) => {
    const period = await GradingPeriod.findOne({ where: { id: req.params.id, schoolId: req.schoolSession!.schoolId } });
    if (!period) throw notFound();
    res.json(await period.update(req.body));
  });

// POST /periods/:id/:action(close|reopen)
export const setPeriodStatus = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const period = await GradingPeriod.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!period) throw notFound();
    if (!session.scope.all && !session.scope.levelIds.includes(period.levelId as number)) throw forbidden('Ese nivel está fuera de tu alcance.');
    await period.update({ closedAt: req.params.action === 'close' ? new Date() : null });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'GradingPeriod', entityId: period.id, action: req.params.action });
    res.json(period);
  });
