/** Controlador de convivencia: la lógica de cada ruta de routes/conduct.routes.ts. */
import { Op, WhereOptions } from 'sequelize';
import { ConductRecord, Student, Subject, sequelize } from '../models';
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/http';
import { assertStudentAccess, studentDivisionId, SchoolSession } from '../services/schoolSession';
import { audit } from '../services/audit';
import { CONDUCT_INCLUDES, conductSummary, conductTree, notifyConduct, toConductRow } from '../services/conduct';
import { Entity, Action } from '../constants/permissions';
import { ConductInput } from '../validators/conduct.validator';
import { CONDUCT_KINDS_WITH_QUANTITY } from '../constants/school';

/**
 * Qué registros ve cada uno: con conduct:read, todos (incluidos los internos); quien solo carga (conduct:create),
 * los visibles para la familia más los propios; familia y estudiante, solo los visibles para la familia.
 */
const visibilityWhere = (session: SchoolSession, asGuardian: boolean): WhereOptions => {
  if (asGuardian) return { visibleToFamily: true };
  if (session.can(Entity.CONDUCT, Action.READ)) return {};
  return { [Op.or]: [{ visibleToFamily: true }, { createdById: session.userId }] };
};

// GET /students/:id/conduct
export const listConduct = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const studentId = Number(req.params.id);
  const { asGuardian } = await assertStudentAccess(session, studentId);
  if (!asGuardian && !session.can(Entity.CONDUCT, Action.READ) && !session.can(Entity.CONDUCT, Action.CREATE)) {
    throw forbidden('No tenés permiso para ver la convivencia de los alumnos.');
  }
  const records = await ConductRecord.findAll({
    where: { schoolId: session.schoolId, studentId, ...visibilityWhere(session, asGuardian) },
    include: CONDUCT_INCLUDES,
    order: [['occurredOn', 'DESC'], ['id', 'DESC']],
  });
  res.json({
    records: conductTree(records),
    summary: conductSummary(records, session.academicYearId),
    canCreate: !asGuardian && session.can(Entity.CONDUCT, Action.CREATE),
  });
});

/** Alta de un registro (append-only: un error se corrige con una RECTIFICACION, nunca editando). */
// POST /students/:id/conduct
export const createConduct = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const studentId = Number(req.params.id);
  const body = req.body as ConductInput;
  // Solo personal con alcance sobre el alumno (un docente que además es familia no carga sobre su propio hijo/a).
  const { asGuardian } = await assertStudentAccess(session, studentId);
  if (asGuardian) throw forbidden('Solo el personal a cargo del alumno puede registrar convivencia.');

  const [student, divisionId, subject, ref] = await Promise.all([
    Student.findOne({ where: { id: studentId, schoolId: session.schoolId }, attributes: ['id', 'firstName', 'lastName', 'userId'] }),
    studentDivisionId(session, studentId),
    body.subjectId ? Subject.findOne({ where: { id: body.subjectId, schoolId: session.schoolId }, attributes: ['id'] }) : null,
    body.refId
      ? ConductRecord.findOne({ where: { id: body.refId, studentId, schoolId: session.schoolId, ...visibilityWhere(session, false) }, attributes: ['id', 'kind', 'refId', 'visibleToFamily'] })
      : null,
  ]);
  if (!student) throw notFound();
  if (body.subjectId && !subject) throw badRequest('Materia inválida.');
  if (body.refId && !ref) throw badRequest('El registro a rectificar no existe o no es de este alumno.');
  // Rectificar una rectificación apunta al original: el historial queda en un solo nivel.
  const original =
    ref && ref.kind === 'RECTIFICACION' && ref.refId
      ? await ConductRecord.findOne({ where: { id: ref.refId, studentId, schoolId: session.schoolId }, attributes: ['id', 'kind', 'visibleToFamily'] })
      : ref;
  if (ref && !original) throw badRequest('El registro a rectificar no existe o no es de este alumno.');
  const refId = original?.id ?? null;
  // La cantidad de una rectificación reemplaza la del original en el resumen: solo tiene sentido en amonestaciones y suspensiones.
  if (original && body.quantity != null && !CONDUCT_KINDS_WITH_QUANTITY.includes(original.kind)) {
    throw badRequest('Solo se corrige la cantidad de una amonestación o una suspensión.');
  }
  // La rectificación de un registro interno queda interna (y sin aviso): si no, la familia se enteraría de que existe.
  const visibleToFamily = body.visibleToFamily && (!ref || (ref.visibleToFamily && !!original?.visibleToFamily));
  const willNotify = body.notifyFamily && visibleToFamily;

  const record = await sequelize.transaction(async (transaction) => {
    const r = await ConductRecord.create(
      {
        schoolId: session.schoolId,
        studentId,
        academicYearId: session.academicYearId,
        divisionId,
        occurredOn: body.occurredOn,
        kind: body.kind,
        quantity: body.quantity ?? null,
        subjectId: body.subjectId ?? null,
        description: body.description,
        measures: body.measures ?? null,
        visibleToFamily,
        refId,
        notifiedAt: willNotify ? new Date() : null,
        createdById: session.userId,
      },
      { transaction }
    );
    await audit(
      { schoolId: session.schoolId, userId: session.userId, entity: 'ConductRecord', entityId: r.id, action: 'create', after: { studentId, kind: r.kind, quantity: r.quantity, occurredOn: r.occurredOn, visibleToFamily: r.visibleToFamily, refId } },
      transaction
    );
    return r;
  });

  // Ya está guardado: si falla el aviso, el registro queda igual (no se devuelve error).
  if (willNotify) await notifyConduct(session.schoolId, student, record).catch((err) => console.error('[conduct notify]', err));
  const full = await ConductRecord.findByPk(record.id, { include: CONDUCT_INCLUDES });
  res.status(201).json(toConductRow(full ?? record));
});
