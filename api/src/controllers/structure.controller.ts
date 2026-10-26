/** Controlador de structure: la lógica de cada ruta de routes/structure.routes.ts. */
import { Op } from 'sequelize';
import { Level, AcademicYear, Division, Subject, TeachingAssignment, GradingPeriod, User, Enrollment, UserRole, StaffPosition, sequelize } from '../models';
import { asyncHandler, notFound, badRequest, forbidden } from '../lib/http';
import { invalidateSchoolSession, divisionWhere, type SchoolSession } from '../services/schoolSession';
import { DEFAULT_LEVEL_SETTINGS, LevelType, gradingModeOf, kindsForMode } from '../constants/school';
import { Entity, Action } from '../constants/permissions';
import { Grade } from '../models';
import { ensurePeriods } from '../services/schoolSetup';
import { audit } from '../services/audit';
import { RoleCode, isStaffRole } from '../constants/roles';
import { assertCanGrant, assertSelfRole } from '../services/access';

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
    const session = req.schoolSession!;
    const level = await Level.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!level) throw notFound();
    // La conducción de un nivel configura SU nivel (modo, escala, rangos); renombrarlo o tocar otros niveles es estructura.
    if (!session.scope.all && !session.scope.levelIds.includes(level.id)) throw forbidden('Ese nivel está fuera de tu alcance.');
    if (req.body.name !== undefined && !session.can(Entity.SCHOOL, Action.UPDATE)) throw forbidden('Solo la conducción general cambia el nombre del nivel.');
    const before = level.toJSON();
    await level.update(req.body.settings ? { ...req.body, settings: { ...level.settings, ...req.body.settings } } : req.body);
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

/** Asignar docentes: quien configura la institución en cualquier nivel; la conducción de un nivel, en el suyo. */
const assertAssignLevel = (session: SchoolSession, levelId: number) => {
  if (!session.can(Entity.SCHOOL, Action.UPDATE) && !session.courseLevelIds.includes(levelId)) throw forbidden('Ese curso es de un nivel que no está a tu cargo.');
};

// POST /divisions
export const createDivision = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    if (!session.academicYearId) throw badRequest('Primero creá el ciclo lectivo.');
    const level = await Level.findOne({ where: { id: req.body.levelId, schoolId: session.schoolId } });
    if (!level) throw notFound('Nivel inexistente.');
    // Cada directivo crea cursos de su nivel (la Representante Legal y quien tiene toda la institución, de cualquiera).
    if (!session.can(Entity.SCHOOL, Action.UPDATE) && !session.courseLevelIds.includes(level.id)) throw forbidden(`No podés crear cursos en ${level.name}: no es un nivel a tu cargo.`);
    const name = String(req.body.name).trim();
    const same = await Division.findOne({ where: { schoolId: session.schoolId, levelId: level.id, academicYearId: session.academicYearId, name: sequelize.where(sequelize.fn('lower', sequelize.col('name')), name.toLowerCase()) } as never });
    if (same) throw badRequest(`Ya existe el curso ${same.name} en ${level.name}.`);
    const division = await Division.create({
      name,
      ...req.body,
      section: req.body.section ?? null,
      shift: req.body.shift ?? null,
      schoolId: session.schoolId,
      academicYearId: session.academicYearId,
    });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Division', entityId: division.id, action: 'create', after: { name: division.name, levelId: level.id } });
    invalidateSchoolSession();
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
    assertAssignLevel(session, req.body.levelId);
    const { gradeYears, ...body } = req.body as { levelId: number; name: string; code?: string | null; gradeYear?: number | null; gradeYears?: number[] };
    const years: Array<number | null> = gradeYears?.length ? [...new Set(gradeYears)] : [body.gradeYear ?? null];
    const created: Subject[] = [];
    const skipped: string[] = [];
    for (const gradeYear of years) {
      // Misma materia en el mismo año: no se duplica.
      if (await subjectExists(session.schoolId, body.levelId, body.name, gradeYear)) {
        skipped.push(gradeYear === null ? 'todos los años' : `${gradeYear}º`);
        continue;
      }
      created.push(await Subject.create({ levelId: body.levelId, name: body.name.trim(), code: body.code ?? null, gradeYear, schoolId: session.schoolId }));
    }
    if (!created.length) throw badRequest(`"${body.name}" ya existe en ${skipped.join(', ')}.`);
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Subject', action: 'create', after: { name: body.name, levelId: body.levelId, years } });
    res.status(201).json({ created, skipped });
  });

const subjectExists = async (schoolId: number, levelId: number, name: string, gradeYear: number | null) =>
  !!(await Subject.findOne({
    where: { schoolId, levelId, gradeYear, active: true, name: sequelize.where(sequelize.fn('lower', sequelize.col('name')), name.trim().toLowerCase()) } as never,
  }));

/**
 * Separa una materia común a todo el nivel en una materia por año: crea (o reutiliza) "Matemática" de
 * 1º, 2º, 3º… y mueve a cada una lo de los cursos de ese año (docentes, notas, publicaciones, archivos,
 * programas, canales y horarios). La materia común queda archivada. No se pierde nada.
 */
const splitSubjectByYear = async (schoolId: number, subject: Subject) => {
  const divisions = await Division.findAll({ where: { schoolId, levelId: subject.levelId }, attributes: ['id', 'gradeYear'] });
  const years = [...new Set(divisions.map((d) => d.gradeYear))].sort((a, b) => a - b);
  const moved: Record<number, number> = {};
  await sequelize.transaction(async (transaction) => {
    for (const year of years) {
      const divisionIds = divisions.filter((d) => d.gradeYear === year).map((d) => d.id);
      let target = await Subject.findOne({
        where: { schoolId, levelId: subject.levelId, gradeYear: year, active: true, name: sequelize.where(sequelize.fn('lower', sequelize.col('name')), subject.name.toLowerCase()) } as never,
        transaction,
      });
      target ??= await Subject.create({ schoolId, levelId: subject.levelId, name: subject.name, code: subject.code, gradeYear: year }, { transaction });
      moved[year] = target.id;
      const rep = { from: subject.id, to: target.id, divisionIds };
      // Asignaciones y notas: si ya existe la misma en la materia del año, se conserva esa.
      await sequelize.query(
        `UPDATE "TeachingAssignment" t SET "subjectId" = :to WHERE t."subjectId" = :from AND t."divisionId" IN (:divisionIds)
           AND NOT EXISTS (SELECT 1 FROM "TeachingAssignment" x WHERE x."divisionId" = t."divisionId" AND x."teacherId" = t."teacherId" AND x."subjectId" = :to)`,
        { replacements: rep, transaction }
      );
      await sequelize.query(
        `UPDATE "Grade" g SET "subjectId" = :to WHERE g."subjectId" = :from AND g."divisionId" IN (:divisionIds)
           AND NOT EXISTS (SELECT 1 FROM "Grade" x WHERE x."studentId" = g."studentId" AND x."periodId" = g."periodId" AND x."subjectId" = :to)`,
        { replacements: rep, transaction }
      );
      for (const table of ['ClassroomPost', 'FileAsset', 'SubjectProgram', 'Channel']) {
        await sequelize.query(`UPDATE "${table}" SET "subjectId" = :to WHERE "subjectId" = :from AND "divisionId" IN (:divisionIds)`, { replacements: rep, transaction });
      }
      // Horarios del personal (franjas con materia y curso).
      const positions = await StaffPosition.findAll({ where: { schoolId, schedule: { [Op.contains]: [{ subjectId: subject.id }] } as never }, transaction });
      for (const p of positions) {
        const schedule = p.schedule.map((s) => (s.subjectId === subject.id && s.divisionId && divisionIds.includes(s.divisionId) ? { ...s, subjectId: target!.id } : s));
        await p.update({ schedule }, { transaction });
      }
    }
    // Lo que quedó (asignaciones duplicadas, etc.) sigue en la común, que pasa a archivada.
    await subject.update({ active: false }, { transaction });
  });
  return moved;
};

// POST /subjects/:id/split — una materia común → una por año
export const splitSubject = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const subject = await Subject.findOne({ where: { id: req.params.id, schoolId: session.schoolId, active: true } });
    if (!subject) throw notFound();
    if (subject.gradeYear !== null) throw badRequest(`"${subject.name}" ya es de ${subject.gradeYear}º.`);
    assertAssignLevel(session, subject.levelId as number);
    const moved = await splitSubjectByYear(session.schoolId, subject);
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Subject', entityId: subject.id, action: 'split', after: moved });
    invalidateSchoolSession();
    res.json({ years: Object.keys(moved).length });
  });

// POST /subjects/split-level — todas las materias comunes de un nivel → una por año
export const splitLevelSubjects = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const levelId = Number(req.body.levelId);
    if (!(await Level.count({ where: { id: levelId, schoolId: session.schoolId } }))) throw notFound('Nivel inexistente.');
    assertAssignLevel(session, levelId);
    const common = await Subject.findAll({ where: { schoolId: session.schoolId, levelId, gradeYear: null, active: true } });
    for (const s of common) await splitSubjectByYear(session.schoolId, s);
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Subject', action: 'split-level', after: { levelId, subjects: common.length } });
    invalidateSchoolSession();
    res.json({ subjects: common.length });
  });

// POST /subjects/copy — las materias de un año (o las comunes) a otros años, sin duplicar.
export const copySubjects = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { levelId, fromYear, toYears } = req.body as { levelId: number; fromYear: number | null; toYears: number[] };
    if (!(await Level.count({ where: { id: levelId, schoolId: session.schoolId } }))) throw notFound('Nivel inexistente.');
    assertAssignLevel(session, levelId);
    const source = await Subject.findAll({ where: { schoolId: session.schoolId, levelId, gradeYear: fromYear, active: true } });
    let created = 0;
    for (const year of toYears.filter((y) => y !== fromYear)) {
      for (const s of source) {
        if (await subjectExists(session.schoolId, levelId, s.name, year)) continue;
        await Subject.create({ schoolId: session.schoolId, levelId, name: s.name, code: s.code, gradeYear: year });
        created++;
      }
    }
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Subject', action: 'copy', after: { levelId, fromYear, toYears, created } });
    res.status(201).json({ created });
  });

// PATCH /subjects/:id
export const updateSubject = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const subject = await Subject.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!subject) throw notFound();
    assertAssignLevel(session, subject.levelId as number);
    // Pasarla a un año: no puede quedar asignada en cursos de otro año.
    if (req.body.gradeYear !== undefined && req.body.gradeYear !== null && req.body.gradeYear !== subject.gradeYear) {
      const other = await TeachingAssignment.count({ where: { subjectId: subject.id }, include: [{ model: Division, where: { gradeYear: { [Op.ne]: req.body.gradeYear } } }] });
      if (other) throw badRequest(`"${subject.name}" tiene docentes asignados en cursos de otro año: quitá esas asignaciones o creá una materia nueva para ${req.body.gradeYear}º.`);
    }
    if (req.body.name && (await subjectExists(session.schoolId, subject.levelId as number, req.body.name, req.body.gradeYear !== undefined ? req.body.gradeYear : subject.gradeYear)) && req.body.name.trim().toLowerCase() !== subject.name.toLowerCase()) {
      throw badRequest(`Ya existe "${req.body.name}" en ese año.`);
    }
    const before = subject.toJSON();
    await subject.update(req.body);
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Subject', entityId: subject.id, action: 'update', before, after: subject.toJSON() });
    res.json(subject);
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
    if (subject.gradeYear !== null && subject.gradeYear !== division.gradeYear) throw badRequest(`"${subject.name}" es de ${subject.gradeYear}º y ${division.name} es de ${division.gradeYear}º.`);
    assertAssignLevel(session, division.levelId as number);
    const teacherId = Number(req.body.teacherId);
    // Tiene que ser parte del personal del colegio. Si no es docente (ej: la Rectora que da clases), se le suma el rol.
    const roles = await UserRole.findAll({ where: { userId: teacherId, schoolId: session.schoolId, active: true } });
    if (!roles.some((r) => isStaffRole(r.role))) throw badRequest('Esa persona no es parte del personal del colegio. Dala de alta en Personal.');
    let addedDocente = false;
    if (!roles.some((r) => r.role === RoleCode.DOCENTE)) {
      assertCanGrant(session, RoleCode.DOCENTE, null);
      if (teacherId === session.userId) assertSelfRole(session, RoleCode.DOCENTE);
      const [docente, created] = await UserRole.findOrCreate({
        where: { userId: teacherId, schoolId: session.schoolId, role: RoleCode.DOCENTE },
        defaults: { userId: teacherId, schoolId: session.schoolId, role: RoleCode.DOCENTE, levelId: null, title: null },
      });
      if (!created) await docente.update({ active: true });
      addedDocente = true;
      await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'UserRole', entityId: docente.id, action: 'create', after: { userId: teacherId, role: RoleCode.DOCENTE, via: 'assignment' } });
    }
    const [assignment, created] = await TeachingAssignment.findOrCreate({
      where: { divisionId: division.id, subjectId: subject.id, teacherId },
      defaults: { divisionId: division.id, subjectId: subject.id, teacherId, schoolId: session.schoolId },
    });
    if (created) await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'TeachingAssignment', entityId: assignment.id, action: 'create', after: { teacherId, divisionId: division.id, subjectId: subject.id } });
    invalidateSchoolSession(teacherId);
    res.status(201).json({ ...assignment.toJSON(), addedDocente, alreadyAssigned: !created });
  });

// DELETE /assignments/:id
export const removeAssignment = asyncHandler(async (req, res) => {
    const a = await TeachingAssignment.findOne({ where: { id: req.params.id, schoolId: req.schoolSession!.schoolId }, include: [{ model: Division, attributes: ['levelId'] }] });
    if (a) {
      assertAssignLevel(req.schoolSession!, a.Division!.levelId as number);
      await audit({ schoolId: req.schoolSession!.schoolId, userId: req.schoolSession!.userId, entity: 'TeachingAssignment', entityId: a.id, action: 'delete', before: { teacherId: a.teacherId, divisionId: a.divisionId, subjectId: a.subjectId } });
      await a.destroy();
      invalidateSchoolSession(a.teacherId as number);
    }
    res.status(204).end();
  });

// ----- Períodos -----
// PATCH /periods/:id
export const updatePeriod = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const period = await GradingPeriod.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!period) throw notFound();
    if (!session.scope.all && !session.scope.levelIds.includes(period.levelId as number)) throw forbidden('Ese nivel está fuera de tu alcance.');
    // Cambiar el tipo de nota con notas ya cargadas las dejaría ilegibles (un 8 en un período conceptual).
    if (req.body.kind && req.body.kind !== period.kind && (await Grade.count({ where: { periodId: period.id } }))) {
      throw badRequest('Este período ya tiene notas cargadas: no se puede cambiar el tipo de nota. Podés cambiarlo en los períodos todavía vacíos.');
    }
    const before = period.toJSON();
    await period.update(req.body);
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'GradingPeriod', entityId: period.id, action: 'update', before, after: period.toJSON() });
    res.json(period);
  });

/**
 * Aplica el modo de calificación del nivel a los períodos del ciclo (solo a los que no tienen notas).
 * Devuelve cuántos cambió y cuántos quedaron igual por tener notas.
 */
// POST /levels/:id/grading-mode/apply
export const applyGradingMode = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const level = await Level.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!level) throw notFound();
    if (!session.scope.all && !session.scope.levelIds.includes(level.id)) throw forbidden('Ese nivel está fuera de tu alcance.');
    const academicYearId = (req.body as { academicYearId?: number }).academicYearId ?? session.academicYearId;
    if (!academicYearId) throw badRequest('No hay ciclo lectivo activo.');
    const periods = await GradingPeriod.findAll({ where: { levelId: level.id, academicYearId }, order: [['order', 'ASC']] });
    // Las notas de cuatrimestre siempre son numéricas: no entran en el patrón.
    const regular = periods.filter((p) => !p.summaryOf);
    const kinds = kindsForMode(gradingModeOf(level), regular.length);
    const graded = new Set(regular.length ? (await Grade.findAll({ where: { periodId: regular.map((p) => p.id) }, attributes: ['periodId'], group: ['periodId'], raw: true })).map((g) => g.periodId as number) : []);
    let updated = 0;
    let skipped = 0;
    for (const [i, period] of regular.entries()) {
      if (period.kind === kinds[i]) continue;
      if (graded.has(period.id)) {
        skipped++;
        continue;
      }
      await period.update({ kind: kinds[i] });
      updated++;
    }
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Level', entityId: level.id, action: 'apply-grading-mode', after: { mode: gradingModeOf(level), updated, skipped } });
    res.json({ mode: gradingModeOf(level), updated, skipped });
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
