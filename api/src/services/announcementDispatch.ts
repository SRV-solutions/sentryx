/**
 * Envío de comunicados: materializa los destinatarios y avisa (push / email).
 * Lo usan "enviar ahora" (controlador) y el programador de envíos (server.ts, cada minuto).
 */
import { Op } from 'sequelize';
import { Announcement, AnnouncementRecipient, sequelize } from '../models';
import { resolveRecipients } from './audience';
import { notify } from './notifications';
import { getSchoolSession, SchoolSession } from './schoolSession';
import { badRequest } from '../lib/http';

/** Pasa un borrador/programado a ENVIADO. Idempotente: si otro proceso lo tomó antes, no hace nada. */
export const dispatchAnnouncement = async (a: Announcement, session: SchoolSession) => {
  const recipients = await resolveRecipients(session, a.audience);
  if (!recipients.size) throw badRequest('La audiencia elegida no tiene destinatarios.');

  const sent = await sequelize.transaction(async (transaction) => {
    // "Reclama" el comunicado: solo un proceso puede pasarlo a SENT.
    const [claimed] = await Announcement.update(
      { status: 'SENT', sentAt: new Date(), scheduledAt: null, recipientCount: recipients.size },
      { where: { id: a.id, status: { [Op.in]: ['DRAFT', 'SCHEDULED'] } }, transaction }
    );
    if (!claimed) return false;
    await AnnouncementRecipient.bulkCreate(
      [...recipients.entries()].map(([userId, studentIds]) => ({ announcementId: a.id, userId, studentIds, readAt: null, ackAt: null })),
      { transaction }
    );
    return true;
  });
  if (!sent) return false;

  notify({
    userIds: [...recipients.keys()],
    title: `${a.priority === 'URGENT' ? '🔴 ' : ''}${a.title}`,
    message: a.body.slice(0, 160),
    type: 'announcement',
    link: `/comunicados/${a.id}`,
    email: a.priority === 'URGENT' || a.requiresAck ? 'fallback' : 'never',
  });
  return true;
};

/** Programados cuya hora ya llegó: se envían con el alcance del autor (si ya no puede, quedan como borrador). */
export const sendDueAnnouncements = async () => {
  const due = await Announcement.findAll({ where: { status: 'SCHEDULED', scheduledAt: { [Op.lte]: new Date() } }, order: [['scheduledAt', 'ASC']], limit: 50 });
  for (const a of due) {
    try {
      const session = await getSchoolSession(a.authorId, a.schoolId, false);
      await dispatchAnnouncement(a, session);
    } catch (err) {
      console.error(`[announcements] no se pudo enviar el programado #${a.id}:`, (err as Error).message);
      await a.update({ status: 'DRAFT', scheduledAt: null }).catch(() => {});
    }
  }
  return due.length;
};
