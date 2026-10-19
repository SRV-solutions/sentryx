/**
 * Calendario institucional (plan Integral): actos, feriados, reuniones y salidas.
 * Cada acto puede tener encargados con un espacio de trabajo (guion, tareas, música, fotos, links).
 * Rutas en routes/events.routes.ts.
 */
import { z } from 'zod';
import { Op, QueryTypes, WhereOptions } from 'sequelize';
import { SchoolEvent, EventManager, EventPost, FileAsset, User, Level, Division, sequelize } from '../models';
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/http';
import { Entity, Action } from '../constants/permissions';
import { PlanFeature, DEFAULT_PLAN, featuresOf, minimumPlanFor } from '../constants/plans';
import { SchoolSession } from '../services/schoolSession';
import { currentPlans } from '../services/plans';
import { nationalHolidays } from '../services/holidays';
import { signFiles, deleteFile } from '../services/files';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';
import { staffMembers } from './staffRecords.controller';
import * as Validator from '../validators/events.validator';

const EVENT_KIND_LABELS: Record<string, string> = { ACTO: 'Acto', FERIADO: 'Feriado', NO_LABORABLE: 'No laborable', EVENTO: 'Evento', REUNION: 'Reunión', SALIDA: 'Salida', OTRO: 'Otro' };

/** Niveles y divisiones de los hijos (o del propio estudiante) en el ciclo actual. */
const familyScope = async (session: SchoolSession) => {
  const studentIds = [...session.childIds, ...(session.self ? [session.self.studentId] : [])];
  if (!studentIds.length || !session.academicYearId) return { levelIds: [] as number[], divisionIds: [] as number[] };
  const rows = (await sequelize.query(
    `SELECT DISTINCT e."divisionId" FROM "Enrollment" e WHERE e."studentId" IN (:ids) AND e."academicYearId" = :year AND e.status = 'ACTIVE'`,
    { replacements: { ids: studentIds, year: session.academicYearId }, type: QueryTypes.SELECT }
  )) as Array<{ divisionId: number }>;
  const divisionIds = rows.map((r) => r.divisionId);
  return { divisionIds, levelIds: [...new Set(divisionIds.map((id) => session.divisionLevel[id]).filter(Boolean))] };
};

/** Borra del almacenamiento los archivos de esas publicaciones del espacio del acto. */
const deletePostFiles = async (posts: EventPost[]) => {
  const ids = posts.flatMap((p) => p.fileIds);
  if (!ids.length) return;
  for (const asset of await FileAsset.findAll({ where: { id: ids, purpose: 'EVENT' } })) await deleteFile(asset);
};

/** Arreglo vacío = "para todos" (todos los niveles / todos los cursos). */
const isEmpty = (column: 'levelIds' | 'divisionIds') => sequelize.where(sequelize.fn('cardinality', sequelize.col(column)), 0);

/** Qué eventos ve cada uno: el personal, todos; familias y estudiantes, los de la comunidad de sus cursos. */
const visibilityWhere = async (session: SchoolSession): Promise<WhereOptions> => {
  if (session.isStaff) {
    if (!session.activeLevelId) return { schoolId: session.schoolId };
    return { schoolId: session.schoolId, [Op.or]: [isEmpty('levelIds'), { levelIds: { [Op.contains]: [session.activeLevelId] } }] };
  }
  const { levelIds, divisionIds } = await familyScope(session);
  return {
    schoolId: session.schoolId,
    audience: 'COMMUNITY',
    [Op.and]: [
      { [Op.or]: [isEmpty('levelIds'), ...(levelIds.length ? [{ levelIds: { [Op.overlap]: levelIds } }] : [])] },
      { [Op.or]: [isEmpty('divisionIds'), ...(divisionIds.length ? [{ divisionIds: { [Op.overlap]: divisionIds } }] : [])] },
    ],
  };
};

const managerInclude = { model: EventManager, as: 'Managers', include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'avatar'] }] };

const isManager = (event: SchoolEvent, userId: number) => !!event.Managers?.some((m) => m.userId === userId);
/** Puede escribir en el espacio del acto: sus encargados y quien edita eventos. */
const canWorkOn = (session: SchoolSession, event: SchoolEvent) => isManager(event, session.userId) || session.can(Entity.EVENTS, Action.UPDATE);

const findEvent = async (session: SchoolSession, id: number) => {
  const event = await SchoolEvent.findOne({ where: { id, schoolId: session.schoolId }, include: [managerInclude] });
  if (!event) throw notFound();
  return event;
};

const assertScope = async (session: SchoolSession, levelIds: number[], divisionIds: number[]) => {
  if (levelIds.length && (await Level.count({ where: { id: levelIds, schoolId: session.schoolId } })) !== levelIds.length) throw badRequest('Nivel inválido.');
  if (divisionIds.length && (await Division.count({ where: { id: divisionIds, schoolId: session.schoolId } })) !== divisionIds.length) throw badRequest('Curso inválido.');
};

// GET /events?from&to
export const listEvents = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { from, to } = req.query as { from?: string; to?: string };
  const where = await visibilityWhere(session);
  const range = from || to ? { date: { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) } } : {};
  const events = await SchoolEvent.findAll({
    where: { ...where, ...range } as WhereOptions,
    include: session.isStaff ? [managerInclude] : [],
    order: [['date', 'ASC'], ['startTime', 'ASC']],
    limit: 1000,
  });
  res.json(
    events.map((event) => ({
      ...event.toJSON(),
      kindLabel: EVENT_KIND_LABELS[event.kind],
      isManager: isManager(event, session.userId),
    }))
  );
});

// GET /events/mine — actos donde soy encargado/a (desde hoy)
export const listMyEvents = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const today = new Date().toISOString().slice(0, 10);
  const events = await SchoolEvent.findAll({
    where: { schoolId: session.schoolId, cancelled: false, date: { [Op.gte]: today } },
    include: [{ ...managerInclude, where: { userId: session.userId } }],
    order: [['date', 'ASC']],
    limit: 50,
  });
  res.json(events.map((event) => ({ ...event.toJSON(), kindLabel: EVENT_KIND_LABELS[event.kind] })));
});

// GET /events/:id — detalle; el personal ve también encargados y el espacio de trabajo
export const getEvent = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const event = await findEvent(session, Number(req.params.id));
  const visible = await SchoolEvent.count({ where: { ...(await visibilityWhere(session)), id: event.id } as WhereOptions });
  if (!visible) throw forbidden();
  const json = { ...event.toJSON(), kindLabel: EVENT_KIND_LABELS[event.kind], isManager: isManager(event, session.userId), canWork: canWorkOn(session, event) };
  if (!session.isStaff) return res.json({ ...json, Managers: undefined, posts: [] });
  const posts = await EventPost.findAll({
    where: { eventId: event.id },
    include: [{ model: User, as: 'Author', attributes: ['id', 'firstName', 'lastName', 'avatar'] }],
    order: [['createdAt', 'ASC']],
  });
  const files = await signFiles(posts.flatMap((p) => p.fileIds));
  res.json({ ...json, posts: posts.map((p) => ({ ...p.toJSON(), files: p.fileIds.map((id) => files.get(id)).filter(Boolean) })) });
});

// POST /events
export const createEvent = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const body = req.body as z.infer<typeof Validator.createEvent.body>;
  await assertScope(session, body.levelIds, body.divisionIds);
  const event = await SchoolEvent.create({
    ...body,
    schoolId: session.schoolId,
    endDate: body.endDate ?? null,
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
    location: body.location ?? null,
    holidayKey: null,
    createdById: session.userId,
  });
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'SchoolEvent', entityId: event.id, action: 'create', after: { title: event.title, date: event.date } });
  res.status(201).json(event);
});

// PATCH /events/:id
export const updateEvent = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const event = await findEvent(session, Number(req.params.id));
  await assertScope(session, req.body.levelIds ?? [], req.body.divisionIds ?? []);
  const before = { title: event.title, date: event.date, cancelled: event.cancelled };
  await event.update(req.body);
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'SchoolEvent', entityId: event.id, action: 'update', before, after: req.body });
  // Si cambió la fecha o se suspendió, avisar a los encargados.
  if ((req.body.date && req.body.date !== before.date) || req.body.cancelled) {
    notify({
      userIds: (event.Managers ?? []).map((m) => m.userId),
      title: req.body.cancelled ? `Se suspendió: ${event.title}` : `Cambió la fecha: ${event.title}`,
      message: req.body.cancelled ? 'El acto fue suspendido.' : `Nueva fecha: ${event.date.split('-').reverse().join('/')}.`,
      type: 'event',
      link: `/calendario/${event.id}`,
    });
  }
  res.json(event);
});

// DELETE /events/:id
export const deleteEvent = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const event = await findEvent(session, Number(req.params.id));
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'SchoolEvent', entityId: event.id, action: 'delete', before: { title: event.title, date: event.date } });
  await deletePostFiles(await EventPost.findAll({ where: { eventId: event.id } }));
  await event.destroy();
  res.status(204).end();
});

// PUT /events/:id/managers — designa a los encargados (personal con plan Integral)
export const setManagers = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const event = await findEvent(session, Number(req.params.id));
  const { managers } = req.body as z.infer<typeof Validator.setManagers.body>;
  const userIds = [...new Set(managers.map((m) => m.userId))];
  const staff = await staffMembers(session.schoolId);
  const notStaff = userIds.filter((id) => !staff.has(id));
  if (notStaff.length) throw badRequest('Los encargados tienen que ser parte del personal del colegio.');
  // Cada encargado usa el espacio del acto: necesita el plan que lo incluye.
  const plans = await currentPlans(session.schoolId, userIds);
  const withoutPlan = userIds.filter((id) => !featuresOf(plans.get(id) ?? DEFAULT_PLAN).has(PlanFeature.EVENTS));
  if (withoutPlan.length) {
    const names = withoutPlan.map((id) => `${staff.get(id)!.user.firstName} ${staff.get(id)!.user.lastName}`).join(', ');
    throw badRequest(`Para ser encargado/a se necesita el plan ${minimumPlanFor(PlanFeature.EVENTS).name}: ${names}. Cambialo en "Planes".`, { code: 'PLAN_REQUIRED', userIds: withoutPlan });
  }
  const previous = new Set((event.Managers ?? []).map((m) => m.userId));
  await sequelize.transaction(async (transaction) => {
    await EventManager.destroy({ where: { eventId: event.id }, transaction });
    await EventManager.bulkCreate(
      managers.map((m) => ({ eventId: event.id, userId: m.userId, task: m.task ?? null })),
      { transaction }
    );
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'SchoolEvent', entityId: event.id, action: 'set-managers', after: { managers } }, transaction);
  });
  const added = userIds.filter((id) => !previous.has(id) && id !== session.userId);
  notify({
    userIds: added,
    title: `Sos encargado/a: ${event.title}`,
    message: `${event.date.split('-').reverse().join('/')}. Ya tenés el espacio del acto para cargar el guion, las tareas y los materiales.`,
    type: 'event',
    link: `/calendario/${event.id}`,
    email: 'fallback',
  });
  res.json(await findEvent(session, event.id));
});

// GET /events/holidays?year — vista previa de feriados y actos sugeridos (marca los ya importados)
export const listHolidays = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const year = Number((req.query as { year?: string }).year);
  const imported = await SchoolEvent.findAll({ where: { schoolId: session.schoolId, holidayKey: { [Op.like]: `${year}-%` } }, attributes: ['holidayKey', 'kind'], raw: true });
  const done = (key: string, acto: boolean) => imported.some((e) => e.holidayKey === key && (e.kind === 'ACTO') === acto);
  res.json(nationalHolidays(year).map((h) => ({ ...h, holidayImported: done(h.key, false), actImported: done(h.key, true) })));
});

// POST /events/holidays — importa los feriados y actos elegidos (no duplica)
export const importHolidays = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { year, items } = req.body as z.infer<typeof Validator.importHolidays.body>;
  const catalog = new Map(nationalHolidays(year).map((h) => [h.key, h]));
  const existing = await SchoolEvent.findAll({ where: { schoolId: session.schoolId, holidayKey: items.map((i) => i.key) }, attributes: ['holidayKey', 'kind'], raw: true });
  const exists = (key: string, acto: boolean) => existing.some((e) => e.holidayKey === key && (e.kind === 'ACTO') === acto);
  let holidays = 0;
  let acts = 0;
  await sequelize.transaction(async (transaction) => {
    for (const item of items) {
      const h = catalog.get(item.key);
      if (!h) continue;
      const base = { schoolId: session.schoolId, holidayKey: h.key, createdById: session.userId, endDate: null, startTime: null, endTime: null, location: null, levelIds: [], divisionIds: [] };
      if (item.holiday && h.kind !== 'EFEMERIDE' && !exists(h.key, false)) {
        await SchoolEvent.create({ ...base, title: h.name, kind: h.kind, date: h.date, audience: 'COMMUNITY', description: h.originalDate ? `Feriado trasladado (fecha original: ${h.originalDate.split('-').reverse().join('/')}).` : '' }, { transaction });
        holidays++;
      }
      if (item.act && h.act && !exists(h.key, true)) {
        await SchoolEvent.create({ ...base, title: h.act.title, kind: 'ACTO', date: item.actDate ?? h.act.date, audience: 'COMMUNITY', description: `Efeméride: ${h.name}.` }, { transaction });
        acts++;
      }
    }
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'SchoolEvent', action: 'import-holidays', after: { year, holidays, acts } }, transaction);
  });
  res.status(201).json({ holidays, acts });
});

// ---------------- Espacio de trabajo del acto ----------------

const validEventFiles = async (session: SchoolSession, fileIds: number[]) => {
  if (!fileIds.length) return;
  const count = await FileAsset.count({ where: { id: fileIds, schoolId: session.schoolId, uploaderId: session.userId, purpose: 'EVENT', status: 'READY' } });
  if (count !== fileIds.length) throw badRequest('Algún archivo no es válido: volvé a subirlo.');
};

// POST /events/:id/posts
export const createPost = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const event = await findEvent(session, Number(req.params.id));
  if (!canWorkOn(session, event)) throw forbidden('Solo los encargados del acto escriben en su espacio.');
  const body = req.body as z.infer<typeof Validator.createPost.body>;
  await validEventFiles(session, body.fileIds);
  if (body.assigneeId && !isManager(event, body.assigneeId)) throw badRequest('Las tareas se asignan a encargados del acto.');
  const post = await EventPost.create({ ...body, eventId: event.id, authorId: session.userId, url: body.url ?? null, assigneeId: body.assigneeId ?? null, dueDate: body.dueDate ?? null });
  const others = (event.Managers ?? []).map((m) => m.userId).filter((id) => id !== session.userId);
  if (body.kind === 'TAREA' && body.assigneeId && body.assigneeId !== session.userId) {
    notify({ userIds: [body.assigneeId], title: `Tarea para ${event.title}`, message: body.body.slice(0, 200), type: 'event', link: `/calendario/${event.id}` });
  } else if (others.length) {
    notify({ userIds: others, title: `Novedades en ${event.title}`, message: (body.body || body.url || 'Se agregó un archivo').slice(0, 200), type: 'event', link: `/calendario/${event.id}`, email: 'never' });
  }
  res.status(201).json(post);
});

const findPost = async (session: SchoolSession, id: number) => {
  const post = await EventPost.findByPk(id);
  if (!post) throw notFound();
  const event = await findEvent(session, post.eventId);
  return { post, event };
};

// PATCH /event-posts/:id — editar o tildar una tarea
export const updatePost = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { post, event } = await findPost(session, Number(req.params.id));
  if (!canWorkOn(session, event)) throw forbidden();
  // El texto solo lo cambia su autor; cualquier encargado puede marcar una tarea como hecha.
  if (req.body.body !== undefined && post.authorId !== session.userId) throw forbidden('Solo quien lo escribió puede editarlo.');
  if (req.body.assigneeId && !isManager(event, req.body.assigneeId)) throw badRequest('Las tareas se asignan a encargados del acto.');
  await post.update(req.body);
  res.json(post);
});

// DELETE /event-posts/:id
export const deletePost = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { post, event } = await findPost(session, Number(req.params.id));
  if (post.authorId !== session.userId && !session.can(Entity.EVENTS, Action.UPDATE)) throw forbidden();
  void event;
  await deletePostFiles([post]);
  await post.destroy();
  res.status(204).end();
});
