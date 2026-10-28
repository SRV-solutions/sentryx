/**
 * Contenido de ejemplo para el colegio de demostración: comunicados (con lecturas y confirmaciones),
 * conversaciones familia–escuela y actividad en un canal de Secundario. Usa la misma lógica que la app
 * (destinatarios según la sesión real de quien envía).
 *
 * Lo llama seedDemo al crear el colegio. También se puede correr sobre un colegio demo ya creado:
 *   npm run demo:content -- --slug demo --domain demo.wearesrv.com        (desarrollo)
 *   node dist/scripts/demoContent.js --slug demo --domain demo.wearesrv.com (producción)
 * No duplica: si el colegio ya tiene comunicados, no hace nada.
 */
import { QueryTypes } from 'sequelize';
import * as M from '../models';
import { getSchoolSession } from '../services/schoolSession';
import { resolveRecipients, audienceLabel, contactsForGuardian } from '../services/audience';
import { roleLabelFor } from '../services/announcementReplies';
import { ensureChannels } from '../controllers/channels.controller';
import type { Audience } from '../models/school/communication';
import type { AnnouncementCategory } from '../constants/school';

const { sequelize } = M;
const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000);

/** Cambia la fecha de creación (la app ordena por fecha: así el ejemplo se ve como de los últimos días). */
const backdate = (table: string, id: number, date: Date) => sequelize.query(`UPDATE "${table}" SET "createdAt" = :date WHERE id = :id`, { replacements: { date, id } });

export const addDemoContent = async (schoolId: number, domain: string) => {
  if (await M.Announcement.count({ where: { schoolId } })) return { skipped: true };
  const userId = async (alias: string) => (await M.User.findOne({ where: { email: `${alias}@${domain}` }, attributes: ['id'] }))?.id ?? null;
  const levelId = async (type: string) => (await M.Level.findOne({ where: { schoolId, type }, attributes: ['id'] }))?.id ?? null;
  const year = await M.AcademicYear.findOne({ where: { schoolId, isCurrent: true } });
  if (!year) return { skipped: true };
  const firstDivision = (type: string) =>
    M.Division.findOne({ where: { schoolId, academicYearId: year.id }, include: [{ model: M.Level, where: { type }, attributes: [] }], order: [['gradeYear', 'DESC'], ['name', 'ASC']] });

  // ---------------- Comunicados ----------------
  const announce = async (
    alias: string,
    audience: Audience,
    title: string,
    body: string,
    opts: { urgent?: boolean; ack?: boolean; daysAgo: number; readShare: number; category: AnnouncementCategory; allowReplies?: boolean }
  ) => {
    const authorId = await userId(alias);
    if (!authorId) return null;
    const session = await getSchoolSession(authorId, schoolId, false);
    const recipients = await resolveRecipients(session, audience);
    if (!recipients.size) return null;
    const announcement = await M.Announcement.create({
      schoolId,
      authorId,
      title,
      body,
      audience,
      audienceLabel: (await audienceLabel(session, audience)) ?? '',
      requiresAck: !!opts.ack,
      priority: opts.urgent ? 'URGENT' : 'NORMAL',
      category: opts.category,
      allowReplies: !!opts.allowReplies,
      attachments: [],
      recipientCount: recipients.size,
    });
    const createdAt = ago(opts.daysAgo);
    await sequelize.query(`UPDATE "Announcement" SET "createdAt" = :date, "sentAt" = :date WHERE id = :id`, { replacements: { date: createdAt, id: announcement.id } });
    // Una parte ya lo leyó (y, si pedía confirmación, la mitad de esos confirmó).
    await M.AnnouncementRecipient.bulkCreate(
      [...recipients.entries()].map(([recipientId, studentIds], i) => {
        const read = (i * 37) % 100 < opts.readShare * 100;
        const readAt = read ? new Date(createdAt.getTime() + ((i % 9) + 1) * 3_600_000) : null;
        return { announcementId: announcement.id, userId: recipientId, studentIds, readAt, ackAt: opts.ack && read && i % 2 === 0 ? readAt : null };
      })
    );
    return { announcement, authorId, recipients };
  };

  /** Una familia responde un comunicado: conversación privada con quien lo envió (como POST /announcements/:id/reply). */
  const replyTo = async (sent: Awaited<ReturnType<typeof announce>>, messages: Array<{ fromFamily: boolean; body: string; hoursAgo: number }>) => {
    if (!sent) return;
    const family = [...sent.recipients.entries()].find(([, studentIds]) => studentIds.length);
    if (!family) return;
    const [familyId, [studentId]] = family;
    const familySession = await getSchoolSession(familyId, schoolId, false);
    const last = messages[messages.length - 1];
    const thread = await M.Thread.create({
      schoolId,
      studentId,
      announcementId: sent.announcement.id,
      subject: `Re: ${sent.announcement.title}`.slice(0, 160),
      createdById: familyId,
      closedAt: null,
      lastMessagePreview: last.body.slice(0, 160),
    });
    await sequelize.query(`UPDATE "Thread" SET "lastMessageAt" = :at, "createdAt" = :first WHERE id = :id`, {
      replacements: { at: ago(0, last.hoursAgo), first: ago(0, messages[0].hoursAgo), id: thread.id },
    });
    await M.ThreadParticipant.bulkCreate([
      { threadId: thread.id, userId: familyId, roleLabel: await roleLabelFor(familySession, familyId, studentId), lastReadAt: ago(0, last.hoursAgo) },
      { threadId: thread.id, userId: sent.authorId, roleLabel: await roleLabelFor(familySession, sent.authorId, studentId), lastReadAt: last.fromFamily ? null : ago(0, last.hoursAgo) },
    ]);
    for (const m of messages) {
      const message = await M.ThreadMessage.create({ threadId: thread.id, senderId: m.fromFamily ? familyId : sent.authorId, body: m.body, attachments: [] });
      await backdate('ThreadMessage', message.id, ago(0, m.hoursAgo));
    }
    await M.AnnouncementRecipient.update({ readAt: ago(0, messages[0].hoursAgo) }, { where: { announcementId: sent.announcement.id, userId: familyId, readAt: null } });
  };

  const [inicial, primario, secundario] = await Promise.all([levelId('INICIAL'), levelId('PRIMARIO'), levelId('SECUNDARIO')]);
  const sala = await firstDivision('INICIAL');
  const secundarioDivision = await firstDivision('SECUNDARIO');

  await announce(
    'representante',
    { type: 'SCHOOL', ids: [] },
    '¡Bienvenidos a Sentryx!',
    'A partir de hoy, todas las comunicaciones de la escuela llegan por acá: comunicados, mensajes con docentes, boletines y asistencia.\n\nPara recibir los avisos en el celular, abran Sentryx en el navegador y elijan "Agregar a la pantalla de inicio".\n\n¡Gracias por acompañarnos!',
    { daysAgo: 9, readShare: 0.85, category: 'INSTITUCIONAL' }
  );
  if (primario) {
    const meeting = await announce(
      'directora',
      { type: 'LEVEL', ids: [primario] },
      'Reunión de familias: primer informe',
      'Los esperamos el jueves a las 18 h en el SUM para conversar sobre el primer informe del año. Pedimos que confirmen la lectura de este comunicado.',
      { ack: true, daysAgo: 4, readShare: 0.7, category: 'EVENTO', allowReplies: true }
    );
    await replyTo(meeting, [
      { fromFamily: true, body: 'Buenas tardes. El jueves trabajo hasta las 19 h. ¿Puedo pasar otro día a buscar el informe?', hoursAgo: 70 },
      { fromFamily: false, body: '¡Hola! Sí, claro. Pueden pasar el viernes de 8 a 12 por la dirección y lo conversamos.', hoursAgo: 66 },
    ]);
  }
  if (secundario) {
    await announce(
      'rectora',
      { type: 'LEVEL', ids: [secundario] },
      'Mañana no hay clases en Secundario',
      'Por trabajos de la distribuidora eléctrica en la cuadra, mañana no habrá clases presenciales en Secundario. Los docentes van a dejar actividades en las aulas virtuales. Por favor confirmen que recibieron el aviso.',
      { urgent: true, ack: true, daysAgo: 1, readShare: 0.6, category: 'INSTITUCIONAL' }
    );
  }
  if (sala && inicial) {
    const teacher = await M.TeachingAssignment.findOne({ where: { divisionId: sala.id }, include: [{ model: M.User, as: 'Teacher', attributes: ['email'] }] });
    const alias = (teacher as unknown as { Teacher?: { email: string } } | null)?.Teacher?.email.split('@')[0];
    await announce(
      alias ?? 'directora',
      { type: 'DIVISION', ids: [sala.id] },
      `${sala.name}: traer una foto familiar`,
      'Para el proyecto "Mi familia", les pedimos que el lunes traigan una foto familiar impresa (puede ser una fotocopia). ¡Gracias!',
      { daysAgo: 2, readShare: 0.5, category: 'AULICO', allowReplies: true }
    );
  }

  // ---------------- Conversaciones familia ↔ escuela ----------------
  const converse = async (studentDivisionId: number, preferRole: RegExp, subject: string, messages: Array<{ fromFamily: boolean; body: string; hoursAgo: number }>) => {
    const enrollment = await M.Enrollment.findOne({ where: { divisionId: studentDivisionId, status: 'ACTIVE' }, attributes: ['studentId'], order: [['studentId', 'ASC']] });
    if (!enrollment) return;
    const studentId = enrollment.studentId as number;
    const guardian = await M.StudentGuardian.findOne({ where: { studentId }, attributes: ['userId'] });
    if (!guardian) return;
    const familyId = guardian.userId as number;
    const familySession = await getSchoolSession(familyId, schoolId, false);
    const contacts = await contactsForGuardian(familySession, studentId);
    const contact = contacts.find((c) => preferRole.test(c.role)) ?? contacts[0];
    if (!contact) return;
    const last = messages[messages.length - 1];
    const thread = await M.Thread.create({ schoolId, studentId, subject, createdById: familyId, closedAt: null, lastMessagePreview: last.body.slice(0, 160) });
    await sequelize.query(`UPDATE "Thread" SET "lastMessageAt" = :at, "createdAt" = :first WHERE id = :id`, {
      replacements: { at: ago(0, last.hoursAgo), first: ago(0, messages[0].hoursAgo), id: thread.id },
    });
    const student = await M.Student.findByPk(studentId, { attributes: ['firstName', 'lastName'] });
    await M.ThreadParticipant.bulkCreate([
      { threadId: thread.id, userId: familyId, roleLabel: `Familia de ${student?.firstName} ${student?.lastName}`, lastReadAt: ago(0, last.hoursAgo) },
      { threadId: thread.id, userId: contact.userId, roleLabel: [contact.role, contact.detail].filter(Boolean).join(' · '), lastReadAt: last.fromFamily ? null : ago(0, last.hoursAgo) },
    ]);
    for (const m of messages) {
      const message = await M.ThreadMessage.create({ threadId: thread.id, senderId: m.fromFamily ? familyId : contact.userId, body: m.body, attachments: [] });
      await backdate('ThreadMessage', message.id, ago(0, m.hoursAgo));
    }
  };

  if (sala) {
    await converse(sala.id, /docente|maestr/i, 'Retiro anticipado el viernes', [
      { fromFamily: true, body: 'Hola seño, el viernes la paso a buscar a las 11 porque tiene turno con la pediatra. ¿Hay algún problema?', hoursAgo: 30 },
      { fromFamily: false, body: '¡Hola! Ningún problema, a las 11 la tengo lista. Recuerden firmar el cuaderno de retiros en la entrada.', hoursAgo: 27 },
      { fromFamily: true, body: 'Perfecto, ¡muchas gracias!', hoursAgo: 26 },
    ]);
  }
  if (secundarioDivision) {
    await converse(secundarioDivision.id, /precep/i, 'Inasistencia del lunes', [
      { fromFamily: true, body: 'Buenas tardes. Faltó el lunes porque tenía fiebre. Mañana le mando el certificado médico.', hoursAgo: 20 },
      { fromFamily: false, body: 'Gracias por avisar. Cuando llegue el certificado, justifico la falta en el sistema y les queda registrado.', hoursAgo: 18 },
    ]);
  }

  // ---------------- Canal de un curso de Secundario ----------------
  if (secundarioDivision) {
    await ensureChannels(schoolId, [secundarioDivision.id]);
    const channel = await M.Channel.findOne({ where: { divisionId: secundarioDivision.id, subjectId: null } });
    const teacherRow = (await sequelize.query(`SELECT "teacherId" FROM "TeachingAssignment" WHERE "divisionId" = :d LIMIT 1`, { replacements: { d: secundarioDivision.id }, type: QueryTypes.SELECT })) as Array<{ teacherId: number }>;
    const studentRow = (await sequelize.query(
      `SELECT s."userId" FROM "Enrollment" e JOIN "Student" s ON s.id = e."studentId" WHERE e."divisionId" = :d AND e.status = 'ACTIVE' AND s."userId" IS NOT NULL LIMIT 1`,
      { replacements: { d: secundarioDivision.id }, type: QueryTypes.SELECT }
    )) as Array<{ userId: number }>;
    if (channel && teacherRow[0] && studentRow[0]) {
      const lines: Array<[number, string, number]> = [
        [teacherRow[0].teacherId, 'Buen día, chicos. Recuerden que el jueves revisamos las carpetas: tienen que estar completas. 📚', 50],
        [studentRow[0].userId, 'Profe, ¿el trabajo práctico se entrega impreso o por el aula?', 26],
        [teacherRow[0].teacherId, 'Por el aula, en PDF. ¡Gracias por preguntar!', 25],
      ];
      for (const [senderId, body, hoursAgo] of lines) {
        const message = await M.ChannelMessage.create({ channelId: channel.id, senderId, body, attachments: [] });
        await backdate('ChannelMessage', message.id, ago(0, hoursAgo));
      }
    }
  }
  return { skipped: false };
};

// Ejecución directa: agrega el contenido a un colegio demo existente.
if (require.main === module) {
  const argument = (name: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > -1 ? process.argv[index + 1] : undefined;
  };
  (async () => {
    const slug = argument('slug') ?? 'demo';
    const domain = argument('domain') ?? 'demo.wearesrv.com';
    const school = await M.School.findOne({ where: { slug } });
    if (!school) throw new Error(`No existe el colegio "${slug}".`);
    const result = await addDemoContent(school.id, domain);
    console.log(result.skipped ? 'El colegio ya tenía comunicados: no se agregó nada.' : `✅ Contenido de ejemplo agregado a "${school.name}".`);
    await sequelize.close();
  })().catch((err) => {
    console.error('❌', err);
    process.exit(1);
  });
}
