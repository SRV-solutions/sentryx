import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Lock, Reply } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { Avatar, Empty, ErrorBox, Skeleton, timeAgo } from '../../ui';
import { norm, stripRe } from '../../school/announcements';

export interface ThreadRow {
  id: number;
  subject: string;
  studentId: number | null;
  studentFirstName: string | null;
  studentLastName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  closedAt: string | null;
  unread: number;
  others: Array<{ userId: number; name: string; avatar: string | null; roleLabel: string }> | null;
  /** Hilo nacido de una respuesta a un comunicado (privado entre quien respondió y quien lo envió). */
  announcementId?: number | null;
}

/**
 * Pestaña "Conversaciones" de Comunicados: los chats privados, incluidas las respuestas a comunicados
 * (cada respuesta abre un 1 a 1 con quien lo envió). GET /threads trae hasta 200, así que el filtro
 * de texto es local.
 */
export const ConversationsList = ({ q = '', unreadOnly = false }: { q?: string; unreadOnly?: boolean }) => {
  const list = useQuery({ queryKey: ['threads'], queryFn: () => apiGet<ThreadRow[]>('/school/threads') });
  const needle = norm(q.trim());
  const rows = (list.data ?? []).filter(
    (t) =>
      (!unreadOnly || t.unread > 0) &&
      (!needle || norm(`${t.subject} ${t.lastMessagePreview} ${t.others?.map((o) => o.name).join(' ') ?? ''} ${t.studentFirstName ?? ''} ${t.studentLastName ?? ''}`).includes(needle))
  );

  if (list.error) return <ErrorBox error={list.error} retry={() => list.refetch()} />;
  if (list.isLoading) return <Skeleton count={6} h={72} />;
  if (!rows.length)
    return needle || unreadOnly ? (
      <Empty title="Nada coincide con la búsqueda" text="Probá con otras palabras o quitá los filtros." icon={<MessageCircle size={36} strokeWidth={1.5} />} />
    ) : (
      <Empty
        title="Sin conversaciones"
        text="Acá aparecen las respuestas a comunicados y los chats privados con la escuela."
        icon={<MessageCircle size={36} strokeWidth={1.5} />}
        action={<Link to="/comunicados/nuevo" className="btn">Nuevo comunicado</Link>}
      />
    );

  return (
    <div className="card list" style={{ overflow: 'hidden' }}>
      {rows.map((t) => {
        const other = t.others?.[0];
        const names = t.others?.map((o) => o.name).join(', ') || 'Conversación';
        return (
          <Link key={t.id} to={`/mensajes/${t.id}`} className={`list-item ${t.unread ? 'unread' : ''}`}>
            <Avatar name={other?.name ?? '?'} src={other?.avatar} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row-between">
                <span className="h3 truncate">{names}</span>
                <span className="xs muted" style={{ flexShrink: 0 }}>{timeAgo(t.lastMessageAt)}</span>
              </div>
              <div className="xs muted truncate">
                {other?.roleLabel}
                {t.studentFirstName && ` · ${t.studentFirstName} ${t.studentLastName}`}
              </div>
              {t.announcementId && (
                <div className="xs truncate row" style={{ gap: 4, color: 'var(--primary)', fontWeight: 700 }}>
                  <Reply size={12} style={{ flexShrink: 0 }} /> <span className="truncate">Respuesta a «{stripRe(t.subject)}»</span>
                </div>
              )}
              <div className="row" style={{ marginTop: 2 }}>
                <span className="small truncate grow" style={{ fontWeight: t.unread ? 700 : 400 }}>
                  {!t.announcementId && <b>{t.subject}: </b>}
                  {t.lastMessagePreview}
                </span>
                {t.closedAt && <Lock size={14} className="muted" aria-label="Conversación cerrada" />}
                {t.unread > 0 && <span className="count" aria-label={`${t.unread} sin leer`}>{t.unread}</span>}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
};
