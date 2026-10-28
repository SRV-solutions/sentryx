/** Controlador de announcements: la lógica de cada ruta de routes/announcements.routes.ts. */
import { z } from 'zod';
import { QueryTypes, Op } from 'sequelize';
import { Announcement, AnnouncementRecipient, Student, User, Level, Division, FileAsset, Thread, ThreadParticipant, ThreadMessage, sequelize } from '../models';
import type { Attachment, AnnouncementStatus } from '../models/school/communication';
import { dispatchAnnouncement } from '../services/announcementDispatch';
import { asyncHandler, notFound, forbidden, badRequest, pagination } from '../lib/http';
import { divisionWhere, SchoolSession, assertStudentAccess } from '../services/schoolSession';
import {
  assertAudience,
  resolveRecipients,
  audienceLabel,
  listFamilies as familiesInScope,
  contactsForGuardian,
  contactsForStudent,
  searchReachablePeople,
  canTargetStudents,
} from '../services/audience';
import { personalAudienceLabel, roleLabelFor, repliesOf } from '../services/announcementReplies';
import { notify } from '../services/notifications';
import { emitToUsers } from '../services/realtime';
import { presignDownload } from '../config/s3';
import { signFiles } from '../services/files';
import { env } from '../config/env';
import { Entity, Action } from '../constants/permissions';
import { announcementBody, attachmentSchema, boxQuery, personalBody, replyBody, searchPeople as searchPeopleSchema } from '../validators/announcements.validator';

/**
 * Entrega URLs firmadas de corta duración. Soporta el formato nuevo (fileId) y el anterior (clave S3 en url).
 * El acceso ya fue validado por quien llama (destinatario del comunicado o participante del hilo).
 */
export const signAttachments = async (atts: Attachment[]) => {
  const list = atts ?? [];
  const signed = await signFiles(list.map((a) => a.fileId).filter((id): id is number => !!id));
  return Promise.all(
    list.map(async (a) => {
      if (a.fileId) {
        const f = signed.get(a.fileId);
        return f ? { ...a, url: f.url } : { ...a, url: '', deleted: true };
      }
      return { ...a, url: env.filesBucket && !a.url.startsWith('http') ? await presignDownload(env.filesBucket, a.url, 3600) : a.url };
    })
  );
};

/** Valida que los adjuntos sean del autor y los convierte al formato guardado. */
export const toAttachments = async (session: SchoolSession, list: z.infer<typeof attachmentSchema>[] = []): Promise<Attachment[]> => {
  if (!list.length) return [];
  const assets = await FileAsset.findAll({ where: { id: list.map((a) => a.fileId), schoolId: session.schoolId, uploaderId: session.userId, status: 'READY' } });
  if (assets.length !== new Set(list.map((a) => a.fileId)).size) throw badRequest('Algún adjunto no es válido o no terminó de subirse.');
  return assets.map((f) => ({ fileId: f.id, name: f.name, url: '', size: f.size, type: f.mimeType }));
};

/**
 * Confirmaciones de lectura: el autor siempre; con announcements.stats, solo si la audiencia está dentro
 * del propio alcance (la preceptora de Primario no ve las estadísticas de un comunicado de Secundario).
 * Personas puntuales (USERS) nunca: ahí están los comunicados personales de familias y estudiantes (antes eran
 * chats privados) y los mensajes 1 a 1 del personal. Ni la conducción ni secretaría los abren, archivan ni recuerdan.
 */
const audienceWithinScope = (session: SchoolSession, a: Announcement) => {
  const aud = a.audience;
  if (aud.type === 'USERS') return false;
  if (session.schoolWide) return true;
  if (aud.type === 'LEVEL') return aud.ids.every((id) => session.scope.levelIds.includes(id));
  if (aud.type === 'DIVISION') return aud.ids.every((id) => session.scope.divisionIds.includes(id));
  return false;
};

const canSeeStats = (session: SchoolSession, a: Announcement) =>
  a.authorId === session.userId || (session.can(Entity.ANNOUNCEMENTS, Action.READ_STATS) && audienceWithinScope(session, a));

// ============================ COMUNICADOS ============================

/** Opciones de audiencia para el redactor, según el alcance del autor. */
// GET /announcements/audiences
export const listAudiences = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const [levels, divisions, targetStudents] = await Promise.all([
      Level.findAll({ where: { schoolId: session.schoolId, ...(session.scope.all ? {} : { id: session.scope.levelIds }) }, attributes: ['id', 'name', 'type'] }),
      session.academicYearId
        ? Division.findAll({ where: { ...divisionWhere(session), academicYearId: session.academicYearId }, attributes: ['id', 'name', 'levelId', 'gradeYear'], order: [['levelId', 'ASC'], ['gradeYear', 'ASC'], ['name', 'ASC']] })
        : [],
      canTargetStudents(session),
    ]);
    res.json({ schoolWide: session.can(Entity.ANNOUNCEMENTS, Action.CREATE_SCHOOL_WIDE), levels, divisions, canTargetStudents: targetStudents });
  });

// GET /announcements/families — listado completo de familias del alcance, con filtros, para elegir una por una.
export const listFamilies = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { page, limit, q, levelId, gradeYear, divisionId, ids } = req.query as unknown as { page: number; limit: number; q?: string; levelId?: number; gradeYear?: number; divisionId?: number; ids?: boolean };
    const rows = await familiesInScope(session, { q, levelId, gradeYear, divisionId });
    if (ids) return res.json({ ids: rows.map((r) => r.userId), total: rows.length });
    res.json({ data: rows.slice((page - 1) * limit, page * limit), pagination: { totalItems: rows.length, currentPage: page, totalPages: Math.ceil(rows.length / limit) } });
  });

/** Datos comunes (alta y edición de borradores/programados). */
const announcementFields = async (session: SchoolSession, input: z.infer<typeof announcementBody>) => {
  await assertAudience(session, input.audience);
  const recipients = await resolveRecipients(session, input.audience);
  if (!recipients.size) throw badRequest('La audiencia elegida no tiene destinatarios.');
  return {
    title: input.title,
    body: input.body,
    audience: input.audience,
    audienceLabel: (await audienceLabel(session, input.audience)) ?? '',
    requiresAck: input.requiresAck,
    priority: input.priority,
    category: input.category,
    allowReplies: input.allowReplies,
    attachments: await toAttachments(session, input.attachments),
    recipientCount: recipients.size,
    // "send" nace como borrador y pasa a SENT en dispatchAnnouncement (mismo camino que un programado).
    status: (input.mode === 'schedule' ? 'SCHEDULED' : 'DRAFT') as AnnouncementStatus,
    scheduledAt: input.mode === 'schedule' ? new Date(input.scheduledAt!) : null,
  };
};

/** Borrador o programado del propio autor (lo único que se puede editar, enviar o eliminar). */
const ownPending = async (session: SchoolSession, id: string | number) => {
  const a = await Announcement.findOne({ where: { id, schoolId: session.schoolId } });
  if (!a) throw notFound();
  if (a.authorId !== session.userId) throw forbidden('Solo el autor puede modificar este comunicado.');
  if (a.status !== 'DRAFT' && a.status !== 'SCHEDULED') throw badRequest('Este comunicado ya fue enviado.');
  return a;
};

// POST /announcements — mode: send (ahora) · draft (guardar) · schedule (enviar en scheduledAt)
export const createAnnouncement = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const input = req.body as z.infer<typeof announcementBody>;
    const a = await Announcement.create({ schoolId: session.schoolId, authorId: session.userId, ...(await announcementFields(session, input)) });
    if (input.mode === 'send') await dispatchAnnouncement(a, session);
    res.status(201).json(await a.reload());
  });

// PUT /announcements/:id — edita un borrador/programado; con mode=send lo envía.
export const updateAnnouncement = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const input = req.body as z.infer<typeof announcementBody>;
    const a = await ownPending(session, req.params.id);
    await a.update(await announcementFields(session, input));
    if (input.mode === 'send') await dispatchAnnouncement(a, session);
    res.json(await a.reload());
  });

// POST /announcements/:id/send — envía ya un borrador o programado.
export const sendAnnouncement = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const a = await ownPending(session, req.params.id);
    await dispatchAnnouncement(a, session);
    res.json(await a.reload());
  });

// DELETE /announcements/:id — solo borradores y programados.
export const deleteAnnouncement = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const a = await ownPending(session, req.params.id);
    await a.destroy();
    res.status(204).end();
  });

/** Archivar: sale de la bandeja de todos (sigue accesible con el filtro "Archivados"). Autor o quien ve sus estadísticas. */
// POST /announcements/:id/archive · /unarchive
export const archiveAnnouncement = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const a = await Announcement.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!a) throw notFound();
    if (!canSeeStats(session, a)) throw forbidden();
    const archive = !req.path.endsWith('/unarchive');
    if (archive && a.status !== 'SENT') throw badRequest('Solo se archivan comunicados enviados.');
    if (!archive && a.status !== 'ARCHIVED') throw badRequest('Este comunicado no está archivado.');
    await a.update(archive ? { status: 'ARCHIVED', archivedAt: new Date() } : { status: 'SENT', archivedAt: null });
    res.json(a);
  });

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

// GET /announcements — bandeja (recibidos) o enviados, con búsqueda y filtros.
export const listAnnouncements = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { page, limit, box, unread, q, priority, pendingAck, attachments, archived, status, category, from, to } = req.query as unknown as z.infer<typeof boxQuery>;
    const author = { model: User, as: 'Author', attributes: ['id', 'firstName', 'lastName', 'avatar'] };
    const text = q ? `%${escapeLike(q)}%` : null;
    const dateColumn = box === 'sent' ? 'createdAt' : 'sentAt';
    const announcementWhere: Record<string | symbol, unknown> = {
      schoolId: session.schoolId,
      ...(text ? { [Op.or]: [{ title: { [Op.iLike]: text } }, { body: { [Op.iLike]: text } }] } : {}),
      ...(priority ? { priority } : {}),
      ...(category ? { category } : {}),
      ...(pendingAck ? { requiresAck: true } : {}),
      ...(attachments ? { [Op.and]: [sequelize.where(sequelize.fn('jsonb_array_length', sequelize.col('Announcement.attachments')), { [Op.gt]: 0 })] } : {}),
      ...(from || to ? { [dateColumn]: { ...(from ? { [Op.gte]: new Date(`${from}T00:00:00`) } : {}), ...(to ? { [Op.lte]: new Date(`${to}T23:59:59.999`) } : {}) } } : {}),
    };

    if (box === 'sent') {
      const { rows, count } = await Announcement.findAndCountAll({
        where: { ...announcementWhere, authorId: session.userId, ...(status ? { status } : {}) },
        attributes: {
          exclude: ['body'],
          include: [
            // ::int para que lleguen como número (COUNT es bigint y pg lo devuelve como texto).
            [sequelize.literal(`(SELECT COUNT(*)::int FROM "AnnouncementRecipient" r WHERE r."announcementId" = "Announcement"."id" AND r."readAt" IS NOT NULL)`), 'readCount'],
            [sequelize.literal(`(SELECT COUNT(*)::int FROM "AnnouncementRecipient" r WHERE r."announcementId" = "Announcement"."id" AND r."ackAt" IS NOT NULL)`), 'ackCount'],
            [sequelize.literal(`(SELECT COUNT(*)::int FROM "Thread" t WHERE t."announcementId" = "Announcement"."id")`), 'replyCount'],
          ],
        },
        include: [author],
        // Programados primero (por hora de envío), después el resto del más nuevo al más viejo.
        order: [[sequelize.literal(`CASE WHEN "Announcement"."status" = 'SCHEDULED' THEN 0 ELSE 1 END`), 'ASC'], ['scheduledAt', 'ASC'], ['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      });
      return res.json({ data: rows, pagination: { totalItems: count, currentPage: page, totalPages: Math.ceil(count / limit) } });
    }

    const { rows, count } = await AnnouncementRecipient.findAndCountAll({
      where: { userId: session.userId, ...(unread ? { readAt: null } : {}), ...(pendingAck ? { ackAt: null } : {}) },
      include: [{ model: Announcement, where: { ...announcementWhere, status: archived ? 'ARCHIVED' : 'SENT' }, include: [author] }],
      order: [[Announcement, 'sentAt', 'DESC'], [Announcement, 'createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    // El estudiante que recibe un comunicado "por" sí mismo no se ve como hijo en la bandeja.
    const selfId = session.self?.studentId;
    const studentIds = [...new Set(rows.flatMap((r) => r.studentIds))].filter((id) => id !== selfId);
    const announcementIds = rows.map((r) => r.Announcement!.id);
    const [students, threads] = await Promise.all([
      studentIds.length ? Student.findAll({ where: { id: studentIds }, attributes: ['id', 'firstName'] }) : [],
      // Mi conversación de respuesta a cada comunicado (índice único announcementId + createdById).
      announcementIds.length ? Thread.findAll({ where: { announcementId: announcementIds, createdById: session.userId }, attributes: ['id', 'announcementId'], raw: true }) : [],
    ]);
    const names = new Map(students.map((s) => [s.id, s.firstName]));
    const myThreads = new Map(threads.map((t) => [t.announcementId as number, t.id]));
    res.json({
      data: rows.map((r) => {
        const a = r.Announcement!;
        return {
          id: a.id,
          title: a.title,
          preview: a.body.slice(0, 180),
          priority: a.priority,
          category: a.category,
          allowReplies: a.allowReplies,
          myThreadId: myThreads.get(a.id) ?? null,
          requiresAck: a.requiresAck,
          audienceLabel: a.audienceLabel,
          hasAttachments: a.attachments.length > 0,
          createdAt: a.sentAt ?? a.createdAt,
          status: a.status,
          author: (a as Announcement & { Author?: User }).Author,
          readAt: r.readAt,
          ackAt: r.ackAt,
          children: r.studentIds.filter((id) => id !== selfId).map((id) => names.get(id)).filter(Boolean),
        };
      }),
      pagination: { totalItems: count, currentPage: page, totalPages: Math.ceil(count / limit) },
    });
  });

// GET /announcements/unread-count
export const countUnread = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const count = await AnnouncementRecipient.count({
      where: { userId: session.userId, readAt: null },
      include: [{ model: Announcement, where: { schoolId: session.schoolId, status: 'SENT' }, attributes: [] }],
    });
    res.json({ count });
  });

/** Detalle: abrirlo lo marca como leído. */
// GET /announcements/:id
export const getAnnouncement = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const a = await Announcement.findOne({
      where: { id: req.params.id, schoolId: session.schoolId },
      include: [{ model: User, as: 'Author', attributes: ['id', 'firstName', 'lastName', 'avatar'] }],
    });
    if (!a) throw notFound();
    const recipient = await AnnouncementRecipient.findOne({ where: { announcementId: a.id, userId: session.userId } });
    const stats = canSeeStats(session, a);
    if (!recipient && !stats) throw forbidden();
    if (recipient && !recipient.readAt) await recipient.update({ readAt: new Date() });
    const isAuthor = a.authorId === session.userId;

    // Las respuestas son privadas: solo quien lo envió ve la lista; cada destinatario, su propia conversación.
    const [myThread, replies] = await Promise.all([
      isAuthor ? null : Thread.findOne({ where: { announcementId: a.id, createdById: session.userId }, attributes: ['id'], raw: true }),
      isAuthor ? repliesOf(session, a.id) : null,
    ]);

    let summary = null;
    if (stats && (a.status === 'SENT' || a.status === 'ARCHIVED')) {
      const [row] = (await sequelize.query(
        `SELECT COUNT(*)::int total, COUNT("readAt")::int read, COUNT("ackAt")::int ack FROM "AnnouncementRecipient" WHERE "announcementId" = :id`,
        { replacements: { id: a.id }, type: QueryTypes.SELECT }
      )) as Array<{ total: number; read: number; ack: number }>;
      summary = row;
    }
    res.json({
      ...a.toJSON(),
      attachments: await signAttachments(a.attachments),
      myReceipt: recipient ? { readAt: recipient.readAt, ackAt: recipient.ackAt } : null,
      stats: summary,
      canManage: stats,
      isAuthor,
      canReply: !!recipient && a.allowReplies && a.status === 'SENT' && !isAuthor,
      myThreadId: myThread?.id ?? null,
      replies,
    });
  });

// POST /announcements/:id/ack
export const acknowledge = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const r = await AnnouncementRecipient.findOne({ where: { announcementId: req.params.id, userId: session.userId } });
    if (!r) throw notFound();
    await r.update({ ackAt: r.ackAt ?? new Date(), readAt: r.readAt ?? new Date() });
    res.json({ ackAt: r.ackAt });
  });

/** Quién leyó / quién confirmó, con el alumno por el que recibe. */
// GET /announcements/:id/recipients
export const listRecipients = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const a = await Announcement.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!a) throw notFound();
    if (!canSeeStats(session, a)) throw forbidden();
    const filter = (req.query as { filter: string }).filter;
    const rows = await AnnouncementRecipient.findAll({
      where: {
        announcementId: a.id,
        ...(filter === 'unread' ? { readAt: null } : filter === 'pending-ack' ? { ackAt: null } : {}),
      },
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName'] }],
      order: [[User, 'lastName', 'ASC']],
    });
    const studentIds = [...new Set(rows.flatMap((r) => r.studentIds))];
    const students = new Map(
      (await Student.findAll({ where: { id: studentIds }, attributes: ['id', 'firstName', 'lastName'] })).map((s) => [s.id, `${s.lastName}, ${s.firstName}`])
    );
    res.json(
      rows.map((r) => ({
        user: (r as AnnouncementRecipient & { User?: User }).User,
        students: r.studentIds.map((id) => students.get(id)),
        readAt: r.readAt,
        ackAt: r.ackAt,
      }))
    );
  });

/** Recordatorio a quienes todavía no leyeron o no confirmaron. */
// POST /announcements/:id/remind
export const remindPending = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const a = await Announcement.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!a) throw notFound();
    if (!canSeeStats(session, a)) throw forbidden();
    const pending = await AnnouncementRecipient.findAll({
      where: { announcementId: a.id, ...(a.requiresAck ? { ackAt: null } : { readAt: null }) },
      attributes: ['userId'],
      raw: true,
    });
    notify({
      userIds: pending.map((p) => p.userId as number),
      title: `Recordatorio: ${a.title}`,
      message: a.requiresAck ? 'Este comunicado requiere tu confirmación de lectura.' : 'Tenés un comunicado sin leer.',
      type: 'announcement',
      link: `/comunicados/${a.id}`,
      email: 'fallback',
    });
    res.json({ reminded: pending.length });
  });

// ============================ COMUNICADO = CHAT ============================

/** Personas puntuales para "Personas" y "Sumar más gente" (personal, familias y estudiantes del alcance). */
// GET /announcements/people?q=&limit=
export const searchPeople = asyncHandler(async (req, res) => {
    const { q, limit } = req.query as unknown as z.infer<typeof searchPeopleSchema.query>;
    res.json(await searchReachablePeople(req.schoolSession!, q, limit));
  });

/**
 * Comunicado de una familia (o del propio estudiante) a sus contactos sobre un alumno: docentes, preceptoría,
 * conducción, secretaría (estudiante: solo docentes y preceptoría). Sale enviado en el acto, en una transacción.
 */
// POST /announcements/personal
export const createPersonal = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const input = req.body as z.infer<typeof personalBody>;
    const { asGuardian } = await assertStudentAccess(session, input.studentId);
    if (!asGuardian) throw forbidden('Solo la familia o el propio estudiante pueden escribir sobre este alumno.');
    const contacts = session.self?.studentId === input.studentId ? await contactsForStudent(session, input.studentId) : await contactsForGuardian(session, input.studentId);
    const byId = new Map(contacts.map((c) => [c.userId, c]));
    const ids = [...new Set(input.recipientIds)].filter((id) => id !== session.userId);
    if (!ids.length) throw badRequest('Elegí a quién le escribís.');
    if (ids.some((id) => !byId.has(id))) throw forbidden('Solo podés escribirles a los docentes, preceptoría y conducción de este alumno.');
    const attachments = await toAttachments(session, input.attachments);

    const now = new Date();
    const a = await sequelize.transaction(async (transaction) => {
      const created = await Announcement.create(
        {
          schoolId: session.schoolId,
          authorId: session.userId,
          title: input.title,
          body: input.body,
          audience: { type: 'USERS', ids, aboutStudentId: input.studentId },
          audienceLabel: personalAudienceLabel(ids.map((id) => byId.get(id)!)),
          attachments,
          requiresAck: false,
          priority: 'NORMAL',
          category: input.category,
          allowReplies: input.allowReplies,
          recipientCount: ids.length,
          status: 'SENT',
          sentAt: now,
        },
        { transaction }
      );
      await AnnouncementRecipient.bulkCreate(
        ids.map((userId) => ({ announcementId: created.id, userId, studentIds: [input.studentId], readAt: null, ackAt: null })),
        { transaction }
      );
      return created;
    });

    const me = await User.findByPk(session.userId, { attributes: ['firstName', 'lastName'] });
    notify({ userIds: ids, title: a.title, message: `${me?.firstName} ${me?.lastName}: ${input.body.slice(0, 140)}`, type: 'announcement', link: `/comunicados/${a.id}`, email: 'fallback' });
    res.status(201).json({ id: a.id, recipientCount: a.recipientCount, status: a.status });
  });

/**
 * Responder un comunicado: la respuesta le llega SOLO a quien lo envió, en una conversación privada (una por persona
 * que responde y comunicado). La primera respuesta la crea; las siguientes la continúan.
 */
// POST /announcements/:id/reply
export const reply = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const input = req.body as z.infer<typeof replyBody>;
    const a = await Announcement.findOne({ where: { id: req.params.id, schoolId: session.schoolId }, attributes: ['id', 'title', 'authorId', 'status', 'allowReplies', 'audience'] });
    const recipient = a && (await AnnouncementRecipient.findOne({ where: { announcementId: a.id, userId: session.userId } }));
    if (!a || !recipient) throw notFound();
    if (a.authorId === session.userId) throw badRequest('No podés responder tu propio comunicado.');
    if (a.status !== 'SENT' || !a.allowReplies) throw badRequest('Este comunicado no admite respuestas.');
    const authorId = a.authorId as number;
    const attachments = await toAttachments(session, input.attachments);
    const studentId = session.self?.studentId ?? recipient.studentIds[0] ?? a.audience.aboutStudentId ?? null;
    // Etiquetas fuera de la transacción (lecturas; no hace falta tener la fila bloqueada mientras tanto).
    const [myLabel, authorLabel] = await Promise.all([roleLabelFor(session, session.userId, studentId), roleLabelFor(session, authorId, studentId)]);
    const now = new Date();
    const preview = input.body.slice(0, 160);

    const message = await sequelize.transaction(async (transaction) => {
      // findOrCreate usa un savepoint: si otra respuesta simultánea creó la conversación (índice único), la vuelve a buscar.
      const [thread, created] = await Thread.findOrCreate({
        where: { announcementId: a.id, createdById: session.userId },
        defaults: { schoolId: session.schoolId, announcementId: a.id, createdById: session.userId, studentId, subject: `Re: ${a.title}`.slice(0, 160), closedAt: null, lastMessagePreview: preview },
        transaction,
      });
      if (created) {
        await ThreadParticipant.bulkCreate(
          [
            { threadId: thread.id, userId: session.userId, roleLabel: myLabel.slice(0, 120), lastReadAt: now },
            { threadId: thread.id, userId: authorId, roleLabel: authorLabel.slice(0, 120), lastReadAt: null },
          ],
          { transaction }
        );
      } else if (thread.closedAt) throw badRequest('La conversación está cerrada.');
      const m = await ThreadMessage.create({ threadId: thread.id, senderId: session.userId, body: input.body, attachments }, { transaction });
      await thread.update({ lastMessageAt: now, lastMessagePreview: preview }, { transaction });
      if (!created) await ThreadParticipant.update({ lastReadAt: now }, { where: { threadId: thread.id, userId: session.userId }, transaction });
      if (!recipient.readAt) await recipient.update({ readAt: now }, { transaction });
      return m;
    });

    const threadId = message.threadId as number;
    const payload = {
      threadId,
      message: { id: message.id, threadId, senderId: session.userId, body: message.body, attachments: await signAttachments(message.attachments), createdAt: message.createdAt },
    };
    emitToUsers([authorId, session.userId], 'thread_message', payload);
    emitToUsers([authorId], 'thread_updated', { threadId });
    const me = await User.findByPk(session.userId, { attributes: ['firstName', 'lastName'] });
    notify({ userIds: [authorId], title: `${me?.firstName} ${me?.lastName} respondió «${a.title}»`, message: input.body.slice(0, 140), type: 'message', link: `/mensajes/${threadId}`, email: 'fallback' });
    res.status(201).json(payload);
  });
