/**
 * CANALES DE CURSO (Secundario)
 * - Estudiantes con cuenta: los canales de SU división (General + cada materia).
 * - Docentes: General de las divisiones donde dictan + el canal de SU materia. Moderan.
 * - Preceptoría y conducción (channels.moderate) con alcance sobre la división: ven y moderan todo.
 * - Familias: sin acceso. No existen mensajes privados entre estudiantes.
 */
import { z } from 'zod';
import { Op, QueryTypes } from 'sequelize';
import { Channel, ChannelMessage, ChannelRead, ChannelMute, Division, Level, Subject, TeachingAssignment, User, FileAsset, sequelize } from '../models';
import type { Attachment } from '../models/school/communication';
import { asyncHandler, notFound, forbidden, badRequest } from '../lib/http';
import { SchoolSession, canSeeDivision } from '../services/schoolSession';
import { emitToUsers } from '../services/realtime';
import { signFiles } from '../services/files';
import { audit } from '../services/audit';
import { Entity, Action } from '../constants/permissions';
import { messageBody } from '../validators/channels.validator';
import { RoleCode } from '../constants/roles';

type Access = { role: 'member' | 'moderator' };

/** Crea (si faltan) el canal General y uno por materia dictada. Solo divisiones de Secundario. */
export const ensureChannels = async (schoolId: number, divisionIds: number[]) => {
  if (!divisionIds.length) return;
  const divisions = await Division.findAll({ where: { id: divisionIds, schoolId }, include: [{ model: Level, attributes: ['type'], where: { type: 'SECUNDARIO' } }], attributes: ['id', 'name'] });
  if (!divisions.length) return;
  const ids = divisions.map((d) => d.id);
  const [existing, assignments] = await Promise.all([
    Channel.findAll({ where: { divisionId: ids }, attributes: ['divisionId', 'subjectId'], raw: true }),
    TeachingAssignment.findAll({ where: { divisionId: ids }, include: [{ model: Subject, attributes: ['id', 'name'] }] }),
  ]);
  const has = new Set(existing.map((c) => `${c.divisionId}:${c.subjectId ?? 0}`));
  const toCreate: Array<{ schoolId: number; divisionId: number; subjectId: number | null; name: string }> = [];
  for (const d of divisions) {
    if (!has.has(`${d.id}:0`)) toCreate.push({ schoolId, divisionId: d.id, subjectId: null, name: `General · ${d.name}` }), has.add(`${d.id}:0`);
  }
  for (const a of assignments) {
    const key = `${a.divisionId}:${a.subjectId}`;
    if (has.has(key)) continue;
    has.add(key);
    const d = divisions.find((x) => x.id === a.divisionId)!;
    toCreate.push({ schoolId, divisionId: d.id, subjectId: a.subjectId as number, name: `${a.Subject?.name ?? 'Materia'} · ${d.name}` });
  }
  if (toCreate.length) await Channel.bulkCreate(toCreate);
};

const onlyTeacher = (session: SchoolSession) => session.isStaff && session.roles.filter((r) => r !== RoleCode.TUTOR && r !== RoleCode.ESTUDIANTE).every((r) => r === RoleCode.DOCENTE);

const accessTo = (session: SchoolSession, ch: Channel): Access | null => {
  if (ch.schoolId !== session.schoolId) return null;
  const teachesHere = session.teaching.some((t) => t.divisionId === ch.divisionId && (ch.subjectId === null || t.subjectId === ch.subjectId));
  if (teachesHere) return { role: 'moderator' };
  if (session.isStaff && !onlyTeacher(session) && session.can(Entity.CHANNELS, Action.MODERATE) && canSeeDivision(session, ch.divisionId)) return { role: 'moderator' };
  if (session.self?.divisionId === ch.divisionId) return { role: 'member' };
  return null;
};

const loadChannel = async (session: SchoolSession, id: number) => {
  const ch = await Channel.findByPk(id);
  const access = ch && accessTo(session, ch);
  if (!ch || !access) throw notFound('Canal inexistente o sin acceso.');
  return { ch, access };
};

/** Usuarios que reciben en tiempo real: estudiantes con cuenta de la división + docentes del canal. */
const audienceOf = async (ch: Channel, academicYearId: number | null) => {
  const [students, teachers] = await Promise.all([
    academicYearId
      ? (sequelize.query(
          `SELECT s."userId" FROM "Enrollment" e JOIN "Student" s ON s.id = e."studentId" AND s.active AND s."userId" IS NOT NULL
             JOIN "UserRole" m ON m."userId" = s."userId" AND m."schoolId" = s."schoolId" AND m.role = 'ESTUDIANTE' AND m.active
            WHERE e."divisionId" = :d AND e."academicYearId" = :y AND e.status = 'ACTIVE'`,
          { replacements: { d: ch.divisionId, y: academicYearId }, type: QueryTypes.SELECT }
        ) as Promise<Array<{ userId: number }>>)
      : Promise.resolve([] as Array<{ userId: number }>),
    TeachingAssignment.findAll({ where: { divisionId: ch.divisionId, ...(ch.subjectId ? { subjectId: ch.subjectId } : {}) }, attributes: ['teacherId'], raw: true }),
  ]);
  return {
    students: students.map((s) => s.userId),
    teachers: [...new Set(teachers.map((t) => t.teacherId as number))],
  };
};

const toView = async (msgs: ChannelMessage[], moderator: boolean) => {
  const files = await signFiles(msgs.flatMap((m) => (m.hiddenAt && !moderator ? [] : (m.attachments ?? []).map((a) => a.fileId!).filter(Boolean))));
  return msgs.map((m) => {
    const hidden = !!m.hiddenAt;
    return {
      id: m.id,
      senderId: m.senderId,
      sender: m.Sender,
      createdAt: m.createdAt,
      hidden,
      // Los estudiantes no ven el texto de un mensaje ocultado; los moderadores sí (para revisar).
      body: hidden && !moderator ? null : m.body,
      attachments: hidden && !moderator ? [] : (m.attachments ?? []).map((a) => ({ ...a, url: files.get(a.fileId!)?.url ?? '' })),
    };
  });
};

// ---------------- Moderación ----------------

const requireModerator = async (session: SchoolSession, channelId: number) => {
  const r = await loadChannel(session, channelId);
  if (r.access.role !== 'moderator') throw forbidden('Solo docentes y preceptoría moderan el canal.');
  return r;
};

/** Mis canales con no leídos y último mensaje. */
// GET /channels
export const listChannels = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    if (!session.academicYearId) return res.json([]);
    let divisionIds: number[] = [];
    if (session.self?.divisionId) divisionIds.push(session.self.divisionId);
    divisionIds.push(...session.teaching.map((t) => t.divisionId));
    if (session.isStaff && !onlyTeacher(session) && session.can(Entity.CHANNELS, Action.MODERATE)) {
      const visible = await Division.findAll({ where: { schoolId: session.schoolId, academicYearId: session.academicYearId, ...(session.scope.all ? {} : { id: session.scope.divisionIds }) }, attributes: ['id'], raw: true });
      divisionIds.push(...visible.map((d) => d.id));
    }
    divisionIds = [...new Set(divisionIds)];
    await ensureChannels(session.schoolId, divisionIds);
    const channels = (await Channel.findAll({ where: { divisionId: divisionIds }, include: [{ model: Division, attributes: ['id', 'name'] }], order: [['divisionId', 'ASC'], ['subjectId', 'ASC NULLS FIRST'], ['name', 'ASC']] })).filter((c) => accessTo(session, c));
    if (!channels.length) return res.json([]);
    const stats = (await sequelize.query(
      `SELECT c.id,
              (SELECT COUNT(*)::int FROM "ChannelMessage" m WHERE m."channelId" = c.id AND m."senderId" <> :uid AND m."hiddenAt" IS NULL
                 AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")) AS unread,
              (SELECT json_build_object('body', m.body, 'createdAt', m."createdAt", 'sender', u."firstName", 'hidden', m."hiddenAt" IS NOT NULL)
                 FROM "ChannelMessage" m JOIN "User" u ON u.id = m."senderId" WHERE m."channelId" = c.id ORDER BY m.id DESC LIMIT 1) AS last
         FROM "Channel" c LEFT JOIN "ChannelRead" r ON r."channelId" = c.id AND r."userId" = :uid
        WHERE c.id IN (:ids)`,
      { replacements: { uid: session.userId, ids: channels.map((c) => c.id) }, type: QueryTypes.SELECT }
    )) as Array<{ id: number; unread: number; last: { body: string; createdAt: string; sender: string; hidden: boolean } | null }>;
    const byId = new Map(stats.map((s) => [s.id, s]));
    res.json(
      channels.map((c) => {
        const st = byId.get(c.id);
        const last = st?.last;
        return {
          id: c.id,
          name: c.name,
          subjectId: c.subjectId,
          division: (c as Channel & { Division?: Division }).Division,
          role: accessTo(session, c)!.role,
          unread: st?.unread ?? 0,
          last: last ? { ...last, body: last.hidden ? 'Mensaje ocultado por moderación' : last.body.slice(0, 120) } : null,
        };
      })
    );
  });

/** Mensajes (paginados hacia atrás), integrantes y estado de silencio propio. Abrir marca como leído. */
// GET /channels/:id
export const getChannel = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { ch, access } = await loadChannel(session, Number(req.params.id));
    const before = (req.query as { before?: number }).before;
    const moderator = access.role === 'moderator';
    const [messages, audience, myMute, division, subject] = await Promise.all([
      ChannelMessage.findAll({
        where: { channelId: ch.id, ...(before ? { id: { [Op.lt]: before } } : {}) },
        include: [{ model: User, as: 'Sender', attributes: ['id', 'firstName', 'lastName', 'avatar'] }],
        order: [['id', 'DESC']],
        limit: 50,
      }),
      audienceOf(ch, session.academicYearId),
      ChannelMute.findOne({ where: { channelId: ch.id, userId: session.userId, until: { [Op.gt]: new Date() } }, order: [['until', 'DESC']] }),
      Division.findByPk(ch.divisionId, { attributes: ['id', 'name'] }),
      ch.subjectId ? Subject.findByPk(ch.subjectId, { attributes: ['id', 'name'] }) : null,
    ]);
    if (!before) await ChannelRead.upsert({ channelId: ch.id, userId: session.userId, lastReadAt: new Date() });
    const mutes = moderator ? await ChannelMute.findAll({ where: { channelId: ch.id, until: { [Op.gt]: new Date() } }, attributes: ['userId', 'until'], raw: true }) : [];
    res.json({
      channel: { id: ch.id, name: ch.name, division, subject, role: access.role },
      teacherIds: audience.teachers,
      studentCount: audience.students.length,
      mutedUntil: myMute?.until ?? null,
      mutes,
      messages: await toView(messages.reverse(), moderator),
      hasMore: messages.length === 50,
    });
  });

/** Integrantes (para la lista del canal): docentes y estudiantes con cuenta. */
// GET /channels/:id/members
export const listMembers = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { ch } = await loadChannel(session, Number(req.params.id));
    const a = await audienceOf(ch, session.academicYearId);
    const users = await User.findAll({ where: { id: [...a.teachers, ...a.students] }, attributes: ['id', 'firstName', 'lastName', 'avatar'], order: [['lastName', 'ASC']] });
    const t = new Set(a.teachers);
    res.json(users.map((u) => ({ ...u.toJSON(), kind: t.has(u.id) ? 'DOCENTE' : 'ESTUDIANTE' })));
  });

// POST /channels/:id/messages
export const postMessage = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { ch, access } = await loadChannel(session, Number(req.params.id));
    if (access.role === 'member') {
      const mute = await ChannelMute.findOne({ where: { channelId: ch.id, userId: session.userId, until: { [Op.gt]: new Date() } }, order: [['until', 'DESC']] });
      if (mute) throw forbidden(`Un docente te silenció en este canal hasta las ${mute.until.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}.`);
    }
    const input = req.body as z.infer<typeof messageBody>;
    let attachments: Attachment[] = [];
    if (input.attachments.length) {
      const assets = await FileAsset.findAll({ where: { id: input.attachments.map((a) => a.fileId), schoolId: session.schoolId, uploaderId: session.userId, status: 'READY' } });
      if (assets.length !== input.attachments.length) throw badRequest('Algún adjunto no es válido o no terminó de subirse.');
      attachments = assets.map((f) => ({ fileId: f.id, name: f.name, url: '', size: f.size, type: f.mimeType }));
    }
    const m = await ChannelMessage.create({ channelId: ch.id, senderId: session.userId, body: input.body, attachments });
    await ChannelRead.upsert({ channelId: ch.id, userId: session.userId, lastReadAt: new Date() });
    const full = await ChannelMessage.findByPk(m.id, { include: [{ model: User, as: 'Sender', attributes: ['id', 'firstName', 'lastName', 'avatar'] }] });
    const [view] = await toView([full!], false);
    const a = await audienceOf(ch, session.academicYearId);
    emitToUsers([...new Set([...a.students, ...a.teachers, session.userId])], 'channel_message', { channelId: ch.id, message: view });
    res.status(201).json(view);
  });

// POST /channels/:id/read
export const markAsRead = asyncHandler(async (req, res) => {
    const { ch } = await loadChannel(req.schoolSession!, Number(req.params.id));
    await ChannelRead.upsert({ channelId: ch.id, userId: req.schoolSession!.userId, lastReadAt: new Date() });
    res.json({ ok: true });
  });

// POST /channel-messages/:id/:action(hide|unhide)
export const setMessageVisibility = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const m = await ChannelMessage.findByPk(Number(req.params.id));
    if (!m) throw notFound();
    const { ch } = await requireModerator(session, m.channelId);
    const hide = req.params.action === 'hide';
    await m.update(hide ? { hiddenAt: new Date(), hiddenById: session.userId } : { hiddenAt: null, hiddenById: null });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'ChannelMessage', entityId: m.id, action: req.params.action, before: { senderId: m.senderId, body: m.body } });
    const a = await audienceOf(ch, session.academicYearId);
    emitToUsers([...a.students, ...a.teachers], 'channel_moderation', { channelId: ch.id, messageId: m.id, hidden: hide });
    res.json({ ok: true });
  });

// POST /channels/:id/mute
export const muteStudent = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { ch } = await requireModerator(session, Number(req.params.id));
    const a = await audienceOf(ch, session.academicYearId);
    if (!a.students.includes(req.body.userId)) throw badRequest('Solo se puede silenciar a estudiantes del canal.');
    const until = new Date(Date.now() + req.body.hours * 3600_000);
    await ChannelMute.create({ channelId: ch.id, userId: req.body.userId, mutedById: session.userId, until, reason: req.body.reason ?? null });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'ChannelMute', entityId: ch.id, action: 'mute', after: { userId: req.body.userId, until } });
    res.json({ until });
  });

// DELETE /channels/:id/mute/:userId
export const unmuteStudent = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { ch } = await requireModerator(session, Number(req.params.id));

    await ChannelMute.update({ until: new Date() }, { where: { channelId: ch.id, userId: Number(req.params.userId), until: { [Op.gt]: new Date() } } });
    res.json({ ok: true });
  });

/** Contador para la navegación. */
// GET /channels-unread
export const countUnread = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    if (!session.self && !session.teaching.length) return res.json({ count: 0 });
    const divisionIds = [...new Set([...(session.self?.divisionId ? [session.self.divisionId] : []), ...session.teaching.map((t) => t.divisionId)])];
    const channels = (await Channel.findAll({ where: { divisionId: divisionIds.length ? divisionIds : [0] } })).filter((c) => accessTo(session, c));
    if (!channels.length) return res.json({ count: 0 });
    const [row] = (await sequelize.query(
      `SELECT COUNT(DISTINCT m."channelId")::int AS count FROM "ChannelMessage" m
         LEFT JOIN "ChannelRead" r ON r."channelId" = m."channelId" AND r."userId" = :uid
        WHERE m."channelId" IN (:ids) AND m."senderId" <> :uid AND m."hiddenAt" IS NULL AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")`,
      { replacements: { uid: session.userId, ids: channels.map((c) => c.id) }, type: QueryTypes.SELECT }
    )) as Array<{ count: number }>;
    res.json(row);
  });
