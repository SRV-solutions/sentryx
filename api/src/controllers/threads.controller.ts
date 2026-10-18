/** Controlador de threads: la lógica de cada ruta de routes/threads.routes.ts. */
import { z } from 'zod';
import { Op, QueryTypes } from 'sequelize';
import { Thread, ThreadParticipant, ThreadMessage, Student, User, UserRole, sequelize } from '../models';
import { asyncHandler, notFound, forbidden, badRequest } from '../lib/http';
import { assertStudentAccess, SchoolSession } from '../services/schoolSession';
import { ROLE_LABELS, NON_STAFF_ROLES } from '../constants/school';
import { contactsForGuardian, contactsForStudent, guardiansOf } from '../services/audience';
import { notify } from '../services/notifications';
import { emitToUsers } from '../services/realtime';
import { Entity, Action } from '../constants/permissions';
import { newThreadBody } from '../validators/announcements.validator';
import { signAttachments, toAttachments } from './announcements.controller';

const roleLabelFor = async (session: SchoolSession, userId: number, studentId: number | null) => {
  if (studentId && session.self?.studentId === studentId && userId === session.userId) return 'Estudiante';
  if (studentId) {
    const g = (await guardiansOf(studentId)).find((c) => c.userId === userId);
    if (g) return `Familia · ${g.detail ?? ''}`.trim();
  }
  const m = await UserRole.findOne({ where: { userId, schoolId: session.schoolId, active: true, role: { [Op.notIn]: NON_STAFF_ROLES } } });
  return m ? ROLE_LABELS[m.role] : 'Familia';
};

const participantOf = async (session: SchoolSession, threadId: number) => {
  const p = await ThreadParticipant.findOne({
    where: { threadId, userId: session.userId },
    include: [{ model: Thread, where: { schoolId: session.schoolId } }],
  });
  if (!p) throw notFound('Conversación inexistente.');
  return p;
};

// ============================ MENSAJES ============================

/** Destinatarios posibles: la familia elige entre docentes/preceptoría/conducción del hijo; el personal, entre las familias del alumno. */
// GET /threads/contacts
export const listContacts = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const studentId = Number(req.query.studentId);
    const { asGuardian } = await assertStudentAccess(session, studentId);
    if (session.self?.studentId === studentId) return res.json(await contactsForStudent(session, studentId));
    if (asGuardian) return res.json(await contactsForGuardian(session, studentId));
    if (!session.can(Entity.MESSAGES, Action.MANAGE)) throw forbidden();
    res.json(await guardiansOf(studentId));
  });

// POST /threads
export const createThread = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const input = req.body as z.infer<typeof newThreadBody>;
    const { asGuardian } = await assertStudentAccess(session, input.studentId);
    const allowed =
      session.self?.studentId === input.studentId
        ? await contactsForStudent(session, input.studentId)
        : asGuardian
          ? await contactsForGuardian(session, input.studentId)
          : session.can(Entity.MESSAGES, Action.MANAGE)
            ? await guardiansOf(input.studentId)
            : [];
    const recipient = allowed.find((c) => c.userId === input.recipientId);
    if (!recipient) throw forbidden('No podés escribirle a esa persona sobre este alumno.');

    const threadAttachments = await toAttachments(session, input.attachments);
    const thread = await sequelize.transaction(async (transaction) => {
      const t = await Thread.create(
        { schoolId: session.schoolId, studentId: input.studentId, subject: input.subject, createdById: session.userId, closedAt: null, lastMessagePreview: input.body.slice(0, 160) },
        { transaction }
      );
      await ThreadParticipant.bulkCreate(
        [
          { threadId: t.id, userId: session.userId, roleLabel: await roleLabelFor(session, session.userId, input.studentId), lastReadAt: new Date() },
          { threadId: t.id, userId: recipient.userId, roleLabel: [recipient.role, recipient.detail].filter(Boolean).join(' · '), lastReadAt: null },
        ],
        { transaction }
      );
      await ThreadMessage.create({ threadId: t.id, senderId: session.userId, body: input.body, attachments: threadAttachments }, { transaction });
      return t;
    });

    emitToUsers([recipient.userId], 'thread_updated', { threadId: thread.id });
    notify({ userIds: [recipient.userId], title: `Nuevo mensaje: ${input.subject}`, message: input.body.slice(0, 140), type: 'message', link: `/mensajes/${thread.id}`, email: 'fallback' });
    res.status(201).json(thread);
  });

/** Bandeja de conversaciones con no leídos calculados en una sola consulta. */
// GET /threads
export const listThreads = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const rows = (await sequelize.query(
      `SELECT t.id, t.subject, t."studentId", t."lastMessageAt", t."lastMessagePreview", t."closedAt",
              s."firstName" AS "studentFirstName", s."lastName" AS "studentLastName",
              (SELECT COUNT(*)::int FROM "ThreadMessage" m
                 WHERE m."threadId" = t.id AND m."senderId" <> :uid
                   AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")) AS unread,
              (SELECT json_agg(json_build_object('userId', u.id, 'name', u."firstName" || ' ' || u."lastName", 'avatar', u.avatar, 'roleLabel', op."roleLabel"))
                 FROM "ThreadParticipant" op JOIN "User" u ON u.id = op."userId"
                 WHERE op."threadId" = t.id AND op."userId" <> :uid) AS others
         FROM "ThreadParticipant" p
         JOIN "Thread" t ON t.id = p."threadId"
         LEFT JOIN "Student" s ON s.id = t."studentId"
        WHERE p."userId" = :uid AND t."schoolId" = :sid
        ORDER BY t."lastMessageAt" DESC
        LIMIT 200`,
      { replacements: { uid: session.userId, sid: session.schoolId }, type: QueryTypes.SELECT }
    )) as unknown[];
    res.json(rows);
  });

// GET /threads/unread-count
export const countUnread = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const [row] = (await sequelize.query(
      `SELECT COUNT(DISTINCT t.id)::int AS count
         FROM "ThreadParticipant" p
         JOIN "Thread" t ON t.id = p."threadId" AND t."schoolId" = :sid
         JOIN "ThreadMessage" m ON m."threadId" = t.id AND m."senderId" <> :uid
        WHERE p."userId" = :uid AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")`,
      { replacements: { uid: session.userId, sid: session.schoolId }, type: QueryTypes.SELECT }
    )) as Array<{ count: number }>;
    res.json(row);
  });

/** Mensajes paginados hacia atrás (scroll infinito liviano en el celular). Abrir marca como leído. */
// GET /threads/:id
export const getThread = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const p = await participantOf(session, Number(req.params.id));
    const thread = p.Thread!;
    const before = (req.query as { before?: number }).before;
    const [messages, participants, student] = await Promise.all([
      ThreadMessage.findAll({
        where: { threadId: thread.id, ...(before ? { id: { [Op.lt]: before } } : {}) },
        order: [['id', 'DESC']],
        limit: 50,
      }),
      ThreadParticipant.findAll({ where: { threadId: thread.id }, include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'avatar'] }] }),
      thread.studentId ? Student.findByPk(thread.studentId as number, { attributes: ['id', 'firstName', 'lastName'] }) : null,
    ]);
    if (!before) await p.update({ lastReadAt: new Date() });
    res.json({
      thread: { id: thread.id, subject: thread.subject, closedAt: thread.closedAt, student },
      participants: participants.map((x) => ({ ...(x as ThreadParticipant & { User?: User }).User!.toJSON(), roleLabel: x.roleLabel, lastReadAt: x.lastReadAt })),
      messages: await Promise.all(messages.reverse().map(async (m) => ({ ...m.toJSON(), attachments: await signAttachments(m.attachments) }))),
      hasMore: messages.length === 50,
    });
  });

// POST /threads/:id/messages
export const postMessage = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const p = await participantOf(session, Number(req.params.id));
    const thread = p.Thread!;
    if (thread.closedAt) throw badRequest('La conversación está cerrada.');
    const attachments = await toAttachments(session, req.body.attachments);
    const message = await sequelize.transaction(async (transaction) => {
      const m = await ThreadMessage.create({ threadId: thread.id, senderId: session.userId, body: req.body.body, attachments }, { transaction });
      await thread.update({ lastMessageAt: new Date(), lastMessagePreview: req.body.body.slice(0, 160) }, { transaction });
      await p.update({ lastReadAt: new Date() }, { transaction });
      return m;
    });
    const others = (await ThreadParticipant.findAll({ where: { threadId: thread.id, userId: { [Op.ne]: session.userId } }, attributes: ['userId'], raw: true })).map((x) => x.userId as number);
    const payload = { threadId: thread.id, message: { ...message.toJSON(), attachments: await signAttachments(message.attachments) } };
    emitToUsers([...others, session.userId], 'thread_message', payload);
    const sender = await User.findByPk(session.userId, { attributes: ['firstName', 'lastName'] });

    notify({ userIds: others, title: `${sender?.firstName} ${sender?.lastName}`, message: `${thread.subject}: ${req.body.body.slice(0, 120)}`, type: 'message', link: `/mensajes/${thread.id}`, email: 'fallback' });
    res.status(201).json(payload.message);
  });

// POST /threads/:id/read
export const markAsRead = asyncHandler(async (req, res) => {
    const p = await participantOf(req.schoolSession!, Number(req.params.id));
    await p.update({ lastReadAt: new Date() });
    res.json({ ok: true });
  });

/** Derivar: el personal suma a un colega (ej: docente → dirección) a la conversación. */
// POST /threads/:id/participants
export const addParticipant = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const p = await participantOf(session, Number(req.params.id));
    const member = await UserRole.findOne({ where: { userId: req.body.userId, schoolId: session.schoolId, active: true, role: { [Op.notIn]: NON_STAFF_ROLES } } });
    if (!member) throw badRequest('Solo se puede sumar personal de la institución.');
    await ThreadParticipant.findOrCreate({
      where: { threadId: p.threadId, userId: req.body.userId },
      defaults: { threadId: p.threadId as number, userId: req.body.userId, roleLabel: ROLE_LABELS[member.role], lastReadAt: null },
    });
    const me = await User.findByPk(session.userId, { attributes: ['firstName', 'lastName'] });
    await ThreadMessage.create({ threadId: p.threadId as number, senderId: session.userId, body: `ℹ️ ${me?.firstName} ${me?.lastName} sumó a ${ROLE_LABELS[member.role]} a la conversación.`, attachments: [] });
    notify({ userIds: [req.body.userId], title: 'Te sumaron a una conversación', message: p.Thread!.subject, type: 'message', link: `/mensajes/${p.threadId}` });
    res.status(201).json({ ok: true });
  });

// POST /threads/:id/:action(close|reopen)
export const setThreadStatus = asyncHandler(async (req, res) => {
    const p = await participantOf(req.schoolSession!, Number(req.params.id));
    await p.Thread!.update({ closedAt: req.params.action === 'close' ? new Date() : null });
    res.json({ ok: true });
  });
