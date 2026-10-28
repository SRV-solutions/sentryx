/**
 * Comunicado = chat: piezas compartidas entre comunicados y conversaciones (etiqueta de rol de cada participante,
 * destinatario legible de un comunicado personal y la lista de respuestas que ve quien lo envió).
 */
import { Op, QueryTypes } from 'sequelize';
import { UserRole, sequelize } from '../models';
import { NON_STAFF_ROLES } from '../constants/school';
import { roleLabel } from './roleRegistry';
import { guardiansOf, type Contact } from './audience';
import type { SchoolSession } from './schoolSession';

/** Con qué rol participa alguien de una conversación sobre un alumno: "Estudiante", "Familia · Madre" o su cargo. */
export const roleLabelFor = async (session: SchoolSession, userId: number, studentId: number | null) => {
  if (studentId && session.self?.studentId === studentId && userId === session.userId) return 'Estudiante';
  if (studentId) {
    const g = (await guardiansOf(studentId)).find((c) => c.userId === userId);
    if (g) return g.role === 'Estudiante' ? 'Estudiante' : `Familia · ${g.detail ?? ''}`.replace(/ · $/, '').trim();
  }
  const m = await UserRole.findOne({ where: { userId, schoolId: session.schoolId, active: true, role: { [Op.notIn]: NON_STAFF_ROLES } } });
  return m ? roleLabel(m.role) : 'Familia';
};

/** Destinatario legible de un comunicado de familia/estudiante: "Prof. Ana Gómez", "Ana Gómez y Juan Pérez", "3 docentes". */
export const personalAudienceLabel = (contacts: Contact[]) => {
  const one = (c: Contact) => (c.role === 'Docente' ? `Prof. ${c.name}` : `${c.name} · ${c.role}`);
  const label =
    contacts.length === 1
      ? one(contacts[0])
      : contacts.length === 2
        ? `${one(contacts[0])} y ${one(contacts[1])}`
        : contacts.every((c) => c.role === 'Docente')
          ? `${contacts.length} docentes`
          : `${contacts.length} contactos`;
  return label.length > 200 ? `${label.slice(0, 199)}…` : label;
};

export interface ReplyRow {
  threadId: number;
  user: { id: number; firstName: string; lastName: string; avatar: string | null };
  roleLabel: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unread: number;
}

/** Respuestas a un comunicado (una conversación por persona), con no leídos del autor, en una sola consulta. */
export const repliesOf = async (session: SchoolSession, announcementId: number) => {
  const items = (await sequelize.query(
    `SELECT t.id AS "threadId", t."lastMessageAt", t."lastMessagePreview",
            json_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName", 'avatar', u.avatar) AS "user",
            COALESCE(cp."roleLabel", '') AS "roleLabel",
            (SELECT COUNT(*)::int FROM "ThreadMessage" m
               WHERE m."threadId" = t.id AND m."senderId" <> :uid
                 AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")) AS unread
       FROM "Thread" t
       JOIN "User" u ON u.id = t."createdById"
       LEFT JOIN "ThreadParticipant" cp ON cp."threadId" = t.id AND cp."userId" = t."createdById"
       LEFT JOIN "ThreadParticipant" p ON p."threadId" = t.id AND p."userId" = :uid
      WHERE t."announcementId" = :aid AND t."schoolId" = :sid
      ORDER BY t."lastMessageAt" DESC`,
    { replacements: { uid: session.userId, sid: session.schoolId, aid: announcementId }, type: QueryTypes.SELECT }
  )) as ReplyRow[];
  // unread total = conversaciones con algo sin leer (como el contador de Conversaciones).
  return { total: items.length, unread: items.filter((r) => r.unread > 0).length, items };
};
