/**
 * Programas de las materias (plan Integral): el docente carga (o sube) el programa anual por unidades.
 * Las unidades son los "planes de aprendizaje" a los que se enlazan los juegos de preguntas.
 * Rutas en routes/teaching.routes.ts.
 */
import { z } from 'zod';
import { Op, QueryTypes } from 'sequelize';
import { SubjectProgram, ProgramUnit, Subject, Division, Level, User, FileAsset, TeachingAssignment, sequelize } from '../models';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../lib/http';
import { Entity, Action } from '../constants/permissions';
import { PlanFeature } from '../constants/plans';
import { SchoolSession } from '../services/schoolSession';
import { signFiles } from '../services/files';
import { audit } from '../services/audit';
import * as Validator from '../validators/programs.validator';

const teaches = (session: SchoolSession, subjectId: number, divisionId?: number | null) =>
  session.teaching.some((t) => t.subjectId === subjectId && (!divisionId || t.divisionId === divisionId));

/** Edita: su autor, quien dicta la materia o quien puede editar programas de otros (conducción). */
const canEdit = (session: SchoolSession, program: SubjectProgram) =>
  program.authorId === session.userId || teaches(session, program.subjectId, program.divisionId) || session.can(Entity.SUBJECT_PROGRAMS, Action.UPDATE);

/** Cursos de los hijos (o del propio estudiante) en el ciclo actual. */
const familyDivisionIds = async (session: SchoolSession) => {
  const ids = [...session.childIds, ...(session.self ? [session.self.studentId] : [])];
  if (!ids.length || !session.academicYearId) return [];
  const rows = (await sequelize.query(
    `SELECT DISTINCT "divisionId" FROM "Enrollment" WHERE "studentId" IN (:ids) AND "academicYearId" = :year AND status = 'ACTIVE'`,
    { replacements: { ids, year: session.academicYearId }, type: QueryTypes.SELECT }
  )) as Array<{ divisionId: number }>;
  return rows.map((r) => r.divisionId);
};

/**
 * Qué programas ve cada uno (del ciclo actual):
 *  - conducción (ver todos): todos; docentes: los de las materias que dicta y los propios;
 *  - familias y estudiantes: los PUBLICADOS de las materias de sus cursos.
 */
const visibleWhere = async (session: SchoolSession) => {
  const base = { schoolId: session.schoolId, academicYearId: session.academicYearId ?? 0 };
  if (session.isStaff) {
    if (session.can(Entity.SUBJECT_PROGRAMS, Action.READ)) return base;
    const subjectIds = [...new Set(session.teaching.map((t) => t.subjectId))];
    return { ...base, [Op.or]: [{ authorId: session.userId }, { subjectId: subjectIds.length ? subjectIds : [0] }] };
  }
  const divisionIds = await familyDivisionIds(session);
  if (!divisionIds.length) return { ...base, id: 0 };
  const assignments = await TeachingAssignment.findAll({ where: { divisionId: divisionIds }, attributes: ['subjectId', 'divisionId'], raw: true });
  const subjectIds = [...new Set(assignments.map((a) => a.subjectId as number))];
  return {
    ...base,
    status: 'PUBLICADO',
    subjectId: subjectIds.length ? subjectIds : [0],
    [Op.or]: [{ divisionId: null }, { divisionId: divisionIds }],
  };
};

const programInclude = [
  { model: Subject, attributes: ['id', 'name'], include: [{ model: Level, attributes: ['id', 'name'] }] },
  { model: Division, attributes: ['id', 'name'] },
  { model: User, as: 'Author', attributes: ['id', 'firstName', 'lastName'] },
];

// GET /programs
export const listPrograms = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { subjectId } = req.query as { subjectId?: number };
  const programs = await SubjectProgram.findAll({
    where: { ...(await visibleWhere(session)), ...(subjectId ? { subjectId } : {}) },
    attributes: ['id', 'subjectId', 'divisionId', 'status', 'publishedAt', 'updatedAt', 'authorId'],
    include: [...programInclude, { model: ProgramUnit, as: 'Units', attributes: ['id'] }],
    order: [[Subject, 'name', 'ASC']],
  });
  res.json(programs.map((p) => ({ ...p.toJSON(), Units: undefined, unitCount: p.Units?.length ?? 0, canEdit: session.isStaff && canEdit(session, p) })));
});

// GET /programs/my-subjects — materias que dicta (para cargar su programa)
export const listMySubjects = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const pairs = session.teaching;
  if (!pairs.length) return res.json([]);
  const [subjects, divisions, programs] = await Promise.all([
    Subject.findAll({ where: { id: [...new Set(pairs.map((p) => p.subjectId))] }, attributes: ['id', 'name'] }),
    Division.findAll({ where: { id: [...new Set(pairs.map((p) => p.divisionId))] }, attributes: ['id', 'name'] }),
    SubjectProgram.findAll({ where: { schoolId: session.schoolId, academicYearId: session.academicYearId ?? 0, subjectId: pairs.map((p) => p.subjectId) }, attributes: ['id', 'subjectId', 'divisionId', 'status'] }),
  ]);
  res.json(
    pairs.map((pair) => {
      const program = programs.find((p) => p.subjectId === pair.subjectId && (p.divisionId === pair.divisionId || p.divisionId === null));
      return {
        subjectId: pair.subjectId,
        subject: subjects.find((s) => s.id === pair.subjectId)?.name,
        divisionId: pair.divisionId,
        division: divisions.find((d) => d.id === pair.divisionId)?.name,
        programId: program?.id ?? null,
        status: program?.status ?? null,
      };
    })
  );
});

const findVisible = async (session: SchoolSession, id: number) => {
  const program = await SubjectProgram.findOne({
    where: { ...(await visibleWhere(session)), id },
    include: [...programInclude, { model: ProgramUnit, as: 'Units' }],
    order: [[{ model: ProgramUnit, as: 'Units' }, 'order', 'ASC']],
  });
  if (!program) throw notFound();
  return program;
};

// GET /programs/:id
export const getProgram = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const program = await findVisible(session, Number(req.params.id));
  const files = await signFiles(program.fileIds);
  res.json({ ...program.toJSON(), files: program.fileIds.map((id) => files.get(id)).filter(Boolean), canEdit: session.isStaff && canEdit(session, program) });
});

const validProgramFiles = async (session: SchoolSession, fileIds: number[], keep: number[] = []) => {
  const fresh = fileIds.filter((id) => !keep.includes(id));
  if (!fresh.length) return;
  const count = await FileAsset.count({ where: { id: fresh, schoolId: session.schoolId, uploaderId: session.userId, purpose: 'PROGRAM', status: 'READY' } });
  if (count !== fresh.length) throw badRequest('Algún archivo no es válido: volvé a subirlo.');
};

type UnitInput = z.infer<typeof Validator.updateProgram.body>['units'][number];

/** Reemplaza las unidades conservando las que vienen con id (los juegos enlazados no se pierden). */
const saveUnits = async (programId: number, units: UnitInput[], transaction: import('sequelize').Transaction) => {
  const existing = await ProgramUnit.findAll({ where: { programId }, transaction });
  const keepIds = units.filter((u) => u.id).map((u) => u.id!);
  const unknown = keepIds.filter((id) => !existing.some((e) => e.id === id));
  if (unknown.length) throw badRequest('Unidad inválida.');
  await ProgramUnit.destroy({ where: { programId, id: { [Op.notIn]: keepIds.length ? keepIds : [0] } }, transaction });
  for (const [index, unit] of units.entries()) {
    const values = { order: index + 1, title: unit.title, contents: unit.contents, learningGoals: unit.learningGoals, startDate: unit.startDate ?? null, endDate: unit.endDate ?? null };
    if (unit.id) await ProgramUnit.update(values, { where: { id: unit.id, programId }, transaction });
    else await ProgramUnit.create({ ...values, programId }, { transaction });
  }
};

// POST /programs
export const createProgram = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { subjectId, divisionId, units, ...fields } = req.body as z.infer<typeof Validator.createProgram.body>;
  if (!session.academicYearId) throw badRequest('No hay ciclo lectivo vigente.');
  if (!teaches(session, subjectId, divisionId) && !session.can(Entity.SUBJECT_PROGRAMS, Action.UPDATE)) throw forbidden('Solo podés cargar el programa de las materias que dictás.');
  if (!(await Subject.count({ where: { id: subjectId, schoolId: session.schoolId } }))) throw badRequest('Materia inválida.');
  if (divisionId && !(await Division.count({ where: { id: divisionId, schoolId: session.schoolId, academicYearId: session.academicYearId } }))) throw badRequest('Curso inválido.');
  const duplicate = await SubjectProgram.findOne({ where: { schoolId: session.schoolId, academicYearId: session.academicYearId, subjectId, divisionId: divisionId ?? null }, attributes: ['id'] });
  if (duplicate) throw conflict(`Esa materia ya tiene programa este año (#${duplicate.id}): editalo.`);
  await validProgramFiles(session, fields.fileIds);
  const program = await sequelize.transaction(async (transaction) => {
    const created = await SubjectProgram.create(
      { ...fields, schoolId: session.schoolId, subjectId, divisionId: divisionId ?? null, academicYearId: session.academicYearId!, authorId: session.userId, publishedAt: null },
      { transaction }
    );
    await saveUnits(created.id, units, transaction);
    return created;
  });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'SubjectProgram', entityId: program.id, action: 'create', after: { subjectId, divisionId, units: units.length } });
  res.status(201).json(program);
});

const findEditable = async (session: SchoolSession, id: number) => {
  const program = await SubjectProgram.findOne({ where: { id, schoolId: session.schoolId } });
  if (!program) throw notFound();
  if (!canEdit(session, program)) throw forbidden('No podés editar este programa.');
  return program;
};

// PUT /programs/:id
export const updateProgram = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const program = await findEditable(session, Number(req.params.id));
  const { units, ...fields } = req.body as z.infer<typeof Validator.updateProgram.body>;
  await validProgramFiles(session, fields.fileIds, program.fileIds);
  await sequelize.transaction(async (transaction) => {
    await program.update(fields, { transaction });
    await saveUnits(program.id, units, transaction);
  });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'SubjectProgram', entityId: program.id, action: 'update', after: { units: units.length } });
  res.json(program);
});

// POST /programs/:id/publish
export const publishProgram = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const program = await findEditable(session, Number(req.params.id));
  const { published } = req.body as { published: boolean };
  await program.update({ status: published ? 'PUBLICADO' : 'BORRADOR', publishedAt: published ? new Date() : null });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'SubjectProgram', entityId: program.id, action: published ? 'publish' : 'unpublish' });
  res.json(program);
});

// DELETE /programs/:id
export const deleteProgram = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const program = await findEditable(session, Number(req.params.id));
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'SubjectProgram', entityId: program.id, action: 'delete', before: { subjectId: program.subjectId } });
  await program.destroy();
  res.status(204).end();
});

// GET /programs/units — unidades de mis programas (para enlazar un juego)
export const listMyUnits = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  if (!session.hasFeature(PlanFeature.SUBJECT_PROGRAMS)) return res.json([]);
  const programs = await SubjectProgram.findAll({
    where: await visibleWhere(session),
    attributes: ['id', 'subjectId'],
    include: [{ model: Subject, attributes: ['id', 'name'] }, { model: Division, attributes: ['id', 'name'] }, { model: ProgramUnit, as: 'Units', attributes: ['id', 'title', 'order'] }],
  });
  res.json(
    programs.flatMap((p) =>
      (p.Units ?? []).sort((a, b) => a.order - b.order).map((u) => ({ id: u.id, title: u.title, order: u.order, subjectId: p.subjectId, subject: p.Subject?.name, division: p.Division?.name ?? null }))
    )
  );
});

