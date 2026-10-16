import { Router } from 'express';
import { z } from 'zod';
import {
  Level,
  AcademicYear,
  Division,
  Subject,
  TeachingAssignment,
  GradingPeriod,
  User,
  Enrollment,
  School,
  sequelize,
} from '../../models';
import { asyncHandler, validate, idParam, notFound, badRequest, forbidden } from '../../lib/http';
import {
  requirePerm,
  requireStaff,
  invalidateSchoolContext,
  divisionWhere,
  userSchools,
} from '../context';
import { LEVEL_TYPES, PERIOD_KINDS, ROLE_LABELS, DEFAULT_LEVEL_SETTINGS, LevelType } from '../constants';
import { createSchool, ensurePeriods } from '../services/setup';
import { audit } from '../services/audit';
import { isSuperAdmin } from '../../middlewares/auth';

const router = Router();
/** Rutas que no requieren escuela activa. */
export const schoolsRouter = Router();

/** Escuelas del usuario (para el selector, como en Educabot pero con roles por escuela). */
schoolsRouter.get(
  '/schools',
  asyncHandler(async (req, res) => {
    const schools = await userSchools(req.user!.id, await isSuperAdmin(req));
    res.json(schools.map((s) => ({ id: s.id, name: s.name, slug: s.slug, logoUrl: s.logoUrl })));
  })
);

/** Alta de institución (solo superadmin de SRV). Crea niveles, ciclo, períodos y reglas por defecto. */
schoolsRouter.post(
  '/schools',
  validate({
    body: z.object({
      name: z.string().min(3).max(160),
      slug: z.string().regex(/^[a-z0-9-]+$/).max(80),
      cue: z.string().max(20).nullish(),
      levels: z.array(z.enum(LEVEL_TYPES)).min(1),
      year: z.number().int().min(2020).max(2100),
    }),
  }),
  asyncHandler(async (req, res) => {
    if (!(await isSuperAdmin(req))) throw forbidden();
    res.status(201).json(await createSchool(req.body));
  })
);

/** Sesión escolar: roles, permisos y alcance. El frontend arma la navegación con esto. */
router.get(
  '/session',
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const school = await School.findByPk(ctx.schoolId);
    res.json({
      school: { id: school!.id, name: school!.name, logoUrl: school!.logoUrl },
      academicYearId: ctx.academicYearId,
      roles: ctx.roles,
      roleLabels: ctx.roles.map((r) => ROLE_LABELS[r]),
      permissions: [...ctx.permissions],
      isStaff: ctx.isStaff,
      isGuardian: ctx.isGuardian,
      scope: ctx.scope,
      teaching: ctx.teaching,
      childIds: ctx.childIds,
    });
  })
);

/** Estructura visible para el usuario: niveles, divisiones (según alcance), materias y períodos del ciclo. */
router.get(
  '/structure',
  requireStaff,
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const [levels, years, divisions, subjects, periods] = await Promise.all([
      Level.findAll({ where: { schoolId: ctx.schoolId }, order: [['id', 'ASC']] }),
      AcademicYear.findAll({ where: { schoolId: ctx.schoolId }, order: [['year', 'DESC']] }),
      ctx.academicYearId
        ? Division.findAll({
            where: { ...divisionWhere(ctx), academicYearId: ctx.academicYearId },
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
      Subject.findAll({ where: { schoolId: ctx.schoolId, active: true }, order: [['name', 'ASC']] }),
      ctx.academicYearId
        ? GradingPeriod.findAll({ where: { schoolId: ctx.schoolId, academicYearId: ctx.academicYearId }, order: [['levelId', 'ASC'], ['order', 'ASC']] })
        : [],
    ]);
    res.json({ levels, years, divisions, subjects, periods });
  })
);

// ----- Niveles -----
router.patch(
  '/levels/:id',
  requirePerm('school.manage'),
  validate({
    params: idParam,
    body: z.object({
      name: z.string().min(2).max(60).optional(),
      settings: z
        .object({
          conceptualScale: z.array(z.string().min(1).max(40)).min(2).max(10),
          numericMin: z.number().min(0).max(10),
          numericMax: z.number().min(1).max(100),
          passingGrade: z.number().min(0).max(100),
          attendanceWeights: z.object({ AUSENTE: z.number().min(0).max(1), TARDE: z.number().min(0).max(1), RETIRO: z.number().min(0).max(1) }),
        })
        .optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const level = await Level.findOne({ where: { id: req.params.id, schoolId: req.school!.schoolId } });
    if (!level) throw notFound();
    const before = level.toJSON();
    await level.update(req.body);
    await audit({ schoolId: req.school!.schoolId, userId: req.user!.id, entity: 'Level', entityId: level.id, action: 'update', before, after: level.toJSON() });
    res.json(level);
  })
);

router.post(
  '/levels',
  requirePerm('school.manage'),
  validate({ body: z.object({ type: z.enum(LEVEL_TYPES) }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const type = req.body.type as LevelType;
    const names: Record<LevelType, string> = { INICIAL: 'Inicial', PRIMARIO: 'Primario', SECUNDARIO: 'Secundario' };
    const level = await Level.create({ schoolId: ctx.schoolId, type, name: names[type], settings: DEFAULT_LEVEL_SETTINGS[type] });
    if (ctx.academicYearId) await ensurePeriods(level, (await AcademicYear.findByPk(ctx.academicYearId))!);
    res.status(201).json(level);
  })
);

// ----- Ciclos lectivos -----
router.post(
  '/years',
  requirePerm('school.manage'),
  validate({
    body: z.object({
      year: z.number().int().min(2020).max(2100),
      startDate: z.string().date(),
      endDate: z.string().date(),
      makeCurrent: z.boolean().default(false),
    }),
  }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const year = await sequelize.transaction(async (transaction) => {
      if (req.body.makeCurrent) await AcademicYear.update({ isCurrent: false }, { where: { schoolId: ctx.schoolId }, transaction });
      const y = await AcademicYear.create(
        { schoolId: ctx.schoolId, year: req.body.year, startDate: req.body.startDate, endDate: req.body.endDate, isCurrent: req.body.makeCurrent },
        { transaction }
      );
      for (const level of await Level.findAll({ where: { schoolId: ctx.schoolId }, transaction })) await ensurePeriods(level, y, transaction);
      return y;
    });
    invalidateSchoolContext();
    res.status(201).json(year);
  })
);

router.post(
  '/years/:id/current',
  requirePerm('school.manage'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const year = await AcademicYear.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!year) throw notFound();
    await sequelize.transaction(async (transaction) => {
      await AcademicYear.update({ isCurrent: false }, { where: { schoolId: ctx.schoolId }, transaction });
      await year.update({ isCurrent: true }, { transaction });
    });
    invalidateSchoolContext();
    res.json(year);
  })
);

// ----- Divisiones -----
const divisionBody = z.object({
  levelId: z.number().int().positive(),
  name: z.string().min(1).max(60),
  gradeYear: z.number().int().min(0).max(7),
  section: z.string().max(20).nullish(),
  shift: z.string().max(30).nullish(),
});

router.post(
  '/divisions',
  requirePerm('school.manage'),
  validate({ body: divisionBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    if (!ctx.academicYearId) throw badRequest('Primero creá el ciclo lectivo.');
    const level = await Level.findOne({ where: { id: req.body.levelId, schoolId: ctx.schoolId } });
    if (!level) throw notFound('Nivel inexistente.');
    const division = await Division.create({
      ...req.body,
      section: req.body.section ?? null,
      shift: req.body.shift ?? null,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    });
    res.status(201).json(division);
  })
);

router.patch(
  '/divisions/:id',
  requirePerm('school.manage'),
  validate({ params: idParam, body: divisionBody.partial() }),
  asyncHandler(async (req, res) => {
    const division = await Division.findOne({ where: { id: req.params.id, schoolId: req.school!.schoolId } });
    if (!division) throw notFound();
    res.json(await division.update(req.body));
  })
);

router.delete(
  '/divisions/:id',
  requirePerm('school.manage'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (await Enrollment.count({ where: { divisionId: id } })) throw badRequest('La división tiene alumnos: movelos antes de eliminarla.');
    await Division.destroy({ where: { id, schoolId: req.school!.schoolId } });
    res.status(204).end();
  })
);

// ----- Materias -----
const subjectBody = z.object({
  levelId: z.number().int().positive(),
  name: z.string().min(2).max(100),
  code: z.string().max(20).nullish(),
  gradeYear: z.number().int().min(0).max(7).nullish(),
});

router.post(
  '/subjects',
  requirePerm('school.manage'),
  validate({ body: subjectBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    if (!(await Level.count({ where: { id: req.body.levelId, schoolId: ctx.schoolId } }))) throw notFound('Nivel inexistente.');
    res.status(201).json(
      await Subject.create({ ...req.body, code: req.body.code ?? null, gradeYear: req.body.gradeYear ?? null, schoolId: ctx.schoolId })
    );
  })
);

router.patch(
  '/subjects/:id',
  requirePerm('school.manage'),
  validate({ params: idParam, body: subjectBody.partial().extend({ active: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const subject = await Subject.findOne({ where: { id: req.params.id, schoolId: req.school!.schoolId } });
    if (!subject) throw notFound();
    res.json(await subject.update(req.body));
  })
);

// ----- Asignaciones docentes -----
router.post(
  '/assignments',
  requirePerm('school.manage'),
  validate({ body: z.object({ divisionId: z.number().int(), subjectId: z.number().int(), teacherId: z.number().int() }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const [division, subject] = await Promise.all([
      Division.findOne({ where: { id: req.body.divisionId, schoolId: ctx.schoolId } }),
      Subject.findOne({ where: { id: req.body.subjectId, schoolId: ctx.schoolId } }),
    ]);
    if (!division || !subject) throw notFound('División o materia inexistente.');
    if (division.levelId !== subject.levelId) throw badRequest('La materia no corresponde al nivel de la división.');
    const [assignment] = await TeachingAssignment.findOrCreate({
      where: { divisionId: division.id, subjectId: subject.id, teacherId: req.body.teacherId },
      defaults: { divisionId: division.id, subjectId: subject.id, teacherId: req.body.teacherId, schoolId: ctx.schoolId },
    });
    invalidateSchoolContext(req.body.teacherId);
    res.status(201).json(assignment);
  })
);

router.delete(
  '/assignments/:id',
  requirePerm('school.manage'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const a = await TeachingAssignment.findOne({ where: { id: req.params.id, schoolId: req.school!.schoolId } });
    if (a) {
      await a.destroy();
      invalidateSchoolContext(a.teacherId as number);
    }
    res.status(204).end();
  })
);

// ----- Períodos -----
router.patch(
  '/periods/:id',
  requirePerm('school.manage'),
  validate({
    params: idParam,
    body: z.object({
      name: z.string().min(2).max(60).optional(),
      groupName: z.string().max(60).nullish(),
      kind: z.enum(PERIOD_KINDS).optional(),
      startDate: z.string().date().nullish(),
      endDate: z.string().date().nullish(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const period = await GradingPeriod.findOne({ where: { id: req.params.id, schoolId: req.school!.schoolId } });
    if (!period) throw notFound();
    res.json(await period.update(req.body));
  })
);

router.post(
  '/periods/:id/:action(close|reopen)',
  requirePerm('periods.close'),
  validate({ params: z.object({ id: z.coerce.number().int(), action: z.enum(['close', 'reopen']) }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const period = await GradingPeriod.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!period) throw notFound();
    if (!ctx.scope.all && !ctx.scope.levelIds.includes(period.levelId as number)) throw forbidden('Ese nivel está fuera de tu alcance.');
    await period.update({ closedAt: req.params.action === 'close' ? new Date() : null });
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'GradingPeriod', entityId: period.id, action: req.params.action });
    res.json(period);
  })
);

export default router;
