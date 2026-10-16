import { Router } from 'express';
import { z } from 'zod';
import { Op, QueryTypes } from 'sequelize';
import {
  Announcement,
  AnnouncementRecipient,
  Thread,
  ThreadParticipant,
  ThreadMessage,
  Student,
  User,
  Level,
  Division,
  Membership,
  FileAsset,
  sequelize,
} from '../../models';
import type { Attachment } from '../../models/school/communication';
import { asyncHandler, validate, idParam, notFound, forbidden, badRequest, pagination } from '../../lib/http';
import { requirePerm, divisionWhere, assertStudentAccess, SchoolContext } from '../context';
import { AUDIENCE_TYPES, ROLE_LABELS } from '../constants';
import { assertAudience, resolveRecipients, audienceLabel, contactsForGuardian, guardiansOf } from '../services/audience';
import { notify } from '../../lib/notify';
import { emitToUsers } from '../../lib/realtime';
import { presignDownload } from '../../config/s3';
import { signFiles } from '../services/files';
import { env } from '../../config/env';

const router = Router();

/** Adjuntos: referencia a un FileAsset ya subido y confirmado (ver routes/files.ts). */
const attachmentSchema = z.object({ fileId: z.number().int() });

/**
 * Entrega URLs firmadas de corta duración. Soporta el formato nuevo (fileId) y el anterior (clave S3 en url).
 * El acceso ya fue validado por quien llama (destinatario del comunicado o participante del hilo).
 */
const signAttachments = async (atts: Attachment[]) => {
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
const toAttachments = async (ctx: SchoolContext, list: z.infer<typeof attachmentSchema>[] = []): Promise<Attachment[]> => {
  if (!list.length) return [];
  const assets = await FileAsset.findAll({ where: { id: list.map((a) => a.fileId), schoolId: ctx.schoolId, uploaderId: ctx.userId, status: 'READY' } });
  if (assets.length !== new Set(list.map((a) => a.fileId)).size) throw badRequest('Algún adjunto no es válido o no terminó de subirse.');
  return assets.map((f) => ({ fileId: f.id, name: f.name, url: '', size: f.size, type: f.mimeType }));
};

// ============================ COMUNICADOS ============================

/** Opciones de audiencia para el redactor, según el alcance del autor. */
router.get(
  '/announcements/audiences',
  requirePerm('announcements.publish'),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const [levels, divisions] = await Promise.all([
      Level.findAll({ where: { schoolId: ctx.schoolId, ...(ctx.scope.all ? {} : { id: ctx.scope.levelIds }) }, attributes: ['id', 'name', 'type'] }),
      ctx.academicYearId
        ? Division.findAll({ where: { ...divisionWhere(ctx), academicYearId: ctx.academicYearId }, attributes: ['id', 'name', 'levelId'], order: [['levelId', 'ASC'], ['gradeYear', 'ASC'], ['name', 'ASC']] })
        : [],
    ]);
    res.json({ schoolWide: ctx.permissions.has('announcements.publish.school'), levels, divisions });
  })
);

const announcementBody = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(20000),
  audience: z.object({ type: z.enum(AUDIENCE_TYPES), ids: z.array(z.number().int()).max(500).default([]), includeStaff: z.boolean().optional() }),
  requiresAck: z.boolean().default(false),
  priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
  attachments: z.array(attachmentSchema).max(10).default([]),
});

router.post(
  '/announcements',
  requirePerm('announcements.publish'),
  validate({ body: announcementBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const input = req.body as z.infer<typeof announcementBody>;
    await assertAudience(ctx, input.audience);
    const recipients = await resolveRecipients(ctx, input.audience);
    if (!recipients.size) throw badRequest('La audiencia elegida no tiene destinatarios.');

    const announcement = await sequelize.transaction(async (transaction) => {
      const a = await Announcement.create(
        {
          schoolId: ctx.schoolId,
          authorId: ctx.userId,
          title: input.title,
          body: input.body,
          audience: input.audience,
          audienceLabel: (await audienceLabel(ctx, input.audience)) ?? '',
          requiresAck: input.requiresAck,
          priority: input.priority,
          attachments: await toAttachments(ctx, input.attachments),
          recipientCount: recipients.size,
        },
        { transaction }
      );
      // Inserción en bloque: 700 destinatarios = 1 INSERT.
      await AnnouncementRecipient.bulkCreate(
        [...recipients.entries()].map(([userId, studentIds]) => ({ announcementId: a.id, userId, studentIds, readAt: null, ackAt: null })),
        { transaction }
      );
      return a;
    });

    notify({
      userIds: [...recipients.keys()],
      title: `${input.priority === 'URGENT' ? '🔴 ' : ''}${input.title}`,
      message: input.body.slice(0, 160),
      type: 'announcement',
      link: `/comunicados/${announcement.id}`,
      email: input.priority === 'URGENT' || input.requiresAck ? 'fallback' : 'never',
    });
    res.status(201).json(announcement);
  })
);

const boxQuery = pagination.extend({ box: z.enum(['inbox', 'sent']).default('inbox'), unread: z.coerce.boolean().optional() });

router.get(
  '/announcements',
  validate({ query: boxQuery }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { page, limit, box, unread } = req.query as unknown as z.infer<typeof boxQuery>;
    const author = { model: User, as: 'Author', attributes: ['id', 'firstName', 'lastName', 'avatar'] };

    if (box === 'sent') {
      const { rows, count } = await Announcement.findAndCountAll({
        where: { schoolId: ctx.schoolId, authorId: ctx.userId },
        attributes: {
          exclude: ['body'],
          include: [
            [sequelize.literal(`(SELECT COUNT(*) FROM "AnnouncementRecipient" r WHERE r."announcementId" = "Announcement"."id" AND r."readAt" IS NOT NULL)`), 'readCount'],
            [sequelize.literal(`(SELECT COUNT(*) FROM "AnnouncementRecipient" r WHERE r."announcementId" = "Announcement"."id" AND r."ackAt" IS NOT NULL)`), 'ackCount'],
          ],
        },
        include: [author],
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      });
      return res.json({ data: rows, pagination: { totalItems: count, currentPage: page, totalPages: Math.ceil(count / limit) } });
    }

    const { rows, count } = await AnnouncementRecipient.findAndCountAll({
      where: { userId: ctx.userId, ...(unread ? { readAt: null } : {}) },
      include: [{ model: Announcement, where: { schoolId: ctx.schoolId }, include: [author] }],
      order: [[Announcement, 'createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    const studentIds = [...new Set(rows.flatMap((r) => r.studentIds))];
    const names = new Map(
      (await Student.findAll({ where: { id: studentIds }, attributes: ['id', 'firstName'] })).map((s) => [s.id, s.firstName])
    );
    res.json({
      data: rows.map((r) => {
        const a = r.Announcement!;
        return {
          id: a.id,
          title: a.title,
          preview: a.body.slice(0, 180),
          priority: a.priority,
          requiresAck: a.requiresAck,
          audienceLabel: a.audienceLabel,
          hasAttachments: a.attachments.length > 0,
          createdAt: a.createdAt,
          author: (a as Announcement & { Author?: User }).Author,
          readAt: r.readAt,
          ackAt: r.ackAt,
          children: r.studentIds.map((id) => names.get(id)).filter(Boolean),
        };
      }),
      pagination: { totalItems: count, currentPage: page, totalPages: Math.ceil(count / limit) },
    });
  })
);

router.get(
  '/announcements/unread-count',
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const count = await AnnouncementRecipient.count({
      where: { userId: ctx.userId, readAt: null },
      include: [{ model: Announcement, where: { schoolId: ctx.schoolId }, attributes: [] }],
    });
    res.json({ count });
  })
);

const canSeeStats = (ctx: SchoolContext, a: Announcement) => a.authorId === ctx.userId || ctx.permissions.has('announcements.stats');

/** Detalle: abrirlo lo marca como leído. */
router.get(
  '/announcements/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const a = await Announcement.findOne({
      where: { id: req.params.id, schoolId: ctx.schoolId },
      include: [{ model: User, as: 'Author', attributes: ['id', 'firstName', 'lastName', 'avatar'] }],
    });
    if (!a) throw notFound();
    const recipient = await AnnouncementRecipient.findOne({ where: { announcementId: a.id, userId: ctx.userId } });
    const stats = canSeeStats(ctx, a);
    if (!recipient && !stats) throw forbidden();
    if (recipient && !recipient.readAt) await recipient.update({ readAt: new Date() });

    let summary = null;
    if (stats) {
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
    });
  })
);

router.post(
  '/announcements/:id/ack',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const r = await AnnouncementRecipient.findOne({ where: { announcementId: req.params.id, userId: ctx.userId } });
    if (!r) throw notFound();
    await r.update({ ackAt: r.ackAt ?? new Date(), readAt: r.readAt ?? new Date() });
    res.json({ ackAt: r.ackAt });
  })
);

/** Quién leyó / quién confirmó, con el alumno por el que recibe. */
router.get(
  '/announcements/:id/recipients',
  validate({ params: idParam, query: z.object({ filter: z.enum(['all', 'unread', 'pending-ack']).default('all') }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const a = await Announcement.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!a) throw notFound();
    if (!canSeeStats(ctx, a)) throw forbidden();
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
  })
);

/** Recordatorio a quienes todavía no leyeron o no confirmaron. */
router.post(
  '/announcements/:id/remind',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const a = await Announcement.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!a) throw notFound();
    if (!canSeeStats(ctx, a)) throw forbidden();
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
  })
);

// ============================ MENSAJES ============================

/** Destinatarios posibles: la familia elige entre docentes/preceptoría/conducción del hijo; el personal, entre las familias del alumno. */
router.get(
  '/threads/contacts',
  validate({ query: z.object({ studentId: z.coerce.number().int() }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const studentId = Number(req.query.studentId);
    const { asGuardian } = await assertStudentAccess(ctx, studentId);
    if (asGuardian) return res.json(await contactsForGuardian(ctx, studentId));
    if (!ctx.permissions.has('messages.staff')) throw forbidden();
    res.json(await guardiansOf(studentId));
  })
);

const roleLabelFor = async (ctx: SchoolContext, userId: number, studentId: number | null) => {
  if (studentId) {
    const g = (await guardiansOf(studentId)).find((c) => c.userId === userId);
    if (g) return `Familia · ${g.detail ?? ''}`.trim();
  }
  const m = await Membership.findOne({ where: { userId, schoolId: ctx.schoolId, active: true, role: { [Op.ne]: 'TUTOR' } } });
  return m ? ROLE_LABELS[m.role] : 'Familia';
};

const newThreadBody = z.object({
  studentId: z.number().int(),
  recipientId: z.number().int(),
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(1).max(5000),
  attachments: z.array(attachmentSchema).max(5).default([]),
});

router.post(
  '/threads',
  validate({ body: newThreadBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const input = req.body as z.infer<typeof newThreadBody>;
    const { asGuardian } = await assertStudentAccess(ctx, input.studentId);
    const allowed = asGuardian ? await contactsForGuardian(ctx, input.studentId) : ctx.permissions.has('messages.staff') ? await guardiansOf(input.studentId) : [];
    const recipient = allowed.find((c) => c.userId === input.recipientId);
    if (!recipient) throw forbidden('No podés escribirle a esa persona sobre este alumno.');

    const threadAttachments = await toAttachments(ctx, input.attachments);
    const thread = await sequelize.transaction(async (transaction) => {
      const t = await Thread.create(
        { schoolId: ctx.schoolId, studentId: input.studentId, subject: input.subject, createdById: ctx.userId, closedAt: null, lastMessagePreview: input.body.slice(0, 160) },
        { transaction }
      );
      await ThreadParticipant.bulkCreate(
        [
          { threadId: t.id, userId: ctx.userId, roleLabel: await roleLabelFor(ctx, ctx.userId, input.studentId), lastReadAt: new Date() },
          { threadId: t.id, userId: recipient.userId, roleLabel: [recipient.role, recipient.detail].filter(Boolean).join(' · '), lastReadAt: null },
        ],
        { transaction }
      );
      await ThreadMessage.create({ threadId: t.id, senderId: ctx.userId, body: input.body, attachments: threadAttachments }, { transaction });
      return t;
    });

    emitToUsers([recipient.userId], 'thread_updated', { threadId: thread.id });
    notify({ userIds: [recipient.userId], title: `Nuevo mensaje: ${input.subject}`, message: input.body.slice(0, 140), type: 'message', link: `/mensajes/${thread.id}`, email: 'fallback' });
    res.status(201).json(thread);
  })
);

/** Bandeja de conversaciones con no leídos calculados en una sola consulta. */
router.get(
  '/threads',
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
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
      { replacements: { uid: ctx.userId, sid: ctx.schoolId }, type: QueryTypes.SELECT }
    )) as unknown[];
    res.json(rows);
  })
);

router.get(
  '/threads/unread-count',
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const [row] = (await sequelize.query(
      `SELECT COUNT(DISTINCT t.id)::int AS count
         FROM "ThreadParticipant" p
         JOIN "Thread" t ON t.id = p."threadId" AND t."schoolId" = :sid
         JOIN "ThreadMessage" m ON m."threadId" = t.id AND m."senderId" <> :uid
        WHERE p."userId" = :uid AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")`,
      { replacements: { uid: ctx.userId, sid: ctx.schoolId }, type: QueryTypes.SELECT }
    )) as Array<{ count: number }>;
    res.json(row);
  })
);

const participantOf = async (ctx: SchoolContext, threadId: number) => {
  const p = await ThreadParticipant.findOne({
    where: { threadId, userId: ctx.userId },
    include: [{ model: Thread, where: { schoolId: ctx.schoolId } }],
  });
  if (!p) throw notFound('Conversación inexistente.');
  return p;
};

/** Mensajes paginados hacia atrás (scroll infinito liviano en el celular). Abrir marca como leído. */
router.get(
  '/threads/:id',
  validate({ params: idParam, query: z.object({ before: z.coerce.number().int().optional() }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const p = await participantOf(ctx, Number(req.params.id));
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
  })
);

router.post(
  '/threads/:id/messages',
  validate({ params: idParam, body: z.object({ body: z.string().trim().min(1).max(5000), attachments: z.array(attachmentSchema).max(5).default([]) }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const p = await participantOf(ctx, Number(req.params.id));
    const thread = p.Thread!;
    if (thread.closedAt) throw badRequest('La conversación está cerrada.');
    const attachments = await toAttachments(ctx, req.body.attachments);
    const message = await sequelize.transaction(async (transaction) => {
      const m = await ThreadMessage.create({ threadId: thread.id, senderId: ctx.userId, body: req.body.body, attachments }, { transaction });
      await thread.update({ lastMessageAt: new Date(), lastMessagePreview: req.body.body.slice(0, 160) }, { transaction });
      await p.update({ lastReadAt: new Date() }, { transaction });
      return m;
    });
    const others = (await ThreadParticipant.findAll({ where: { threadId: thread.id, userId: { [Op.ne]: ctx.userId } }, attributes: ['userId'], raw: true })).map((x) => x.userId as number);
    const payload = { threadId: thread.id, message: { ...message.toJSON(), attachments: await signAttachments(message.attachments) } };
    emitToUsers([...others, ctx.userId], 'thread_message', payload);
    const sender = await User.findByPk(ctx.userId, { attributes: ['firstName', 'lastName'] });
    // Solo push (sin campana duplicada por cada mensaje de chat); email como respaldo si no tiene push.
    notify({ userIds: others, title: `${sender?.firstName} ${sender?.lastName}`, message: `${thread.subject}: ${req.body.body.slice(0, 120)}`, type: 'message', link: `/mensajes/${thread.id}`, email: 'fallback' });
    res.status(201).json(payload.message);
  })
);

router.post(
  '/threads/:id/read',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const p = await participantOf(req.school!, Number(req.params.id));
    await p.update({ lastReadAt: new Date() });
    res.json({ ok: true });
  })
);

/** Derivar: el personal suma a un colega (ej: docente → dirección) a la conversación. */
router.post(
  '/threads/:id/participants',
  requirePerm('messages.staff'),
  validate({ params: idParam, body: z.object({ userId: z.number().int() }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const p = await participantOf(ctx, Number(req.params.id));
    const member = await Membership.findOne({ where: { userId: req.body.userId, schoolId: ctx.schoolId, active: true, role: { [Op.ne]: 'TUTOR' } } });
    if (!member) throw badRequest('Solo se puede sumar personal de la institución.');
    await ThreadParticipant.findOrCreate({
      where: { threadId: p.threadId, userId: req.body.userId },
      defaults: { threadId: p.threadId as number, userId: req.body.userId, roleLabel: ROLE_LABELS[member.role], lastReadAt: null },
    });
    const me = await User.findByPk(ctx.userId, { attributes: ['firstName', 'lastName'] });
    await ThreadMessage.create({ threadId: p.threadId as number, senderId: ctx.userId, body: `ℹ️ ${me?.firstName} ${me?.lastName} sumó a ${ROLE_LABELS[member.role]} a la conversación.`, attachments: [] });
    notify({ userIds: [req.body.userId], title: 'Te sumaron a una conversación', message: p.Thread!.subject, type: 'message', link: `/mensajes/${p.threadId}` });
    res.status(201).json({ ok: true });
  })
);

router.post(
  '/threads/:id/:action(close|reopen)',
  requirePerm('messages.staff'),
  validate({ params: z.object({ id: z.coerce.number().int(), action: z.enum(['close', 'reopen']) }) }),
  asyncHandler(async (req, res) => {
    const p = await participantOf(req.school!, Number(req.params.id));
    await p.Thread!.update({ closedAt: req.params.action === 'close' ? new Date() : null });
    res.json({ ok: true });
  })
);

export default router;
