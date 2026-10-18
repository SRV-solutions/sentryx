import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Plus, Lock } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { Avatar, Empty, ErrorBox, PageHeader, Skeleton, timeAgo } from '../../ui';

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
}

export default function ThreadsPage() {
  const q = useQuery({ queryKey: ['threads'], queryFn: () => apiGet<ThreadRow[]>('/school/threads') });

  return (
    <div className="stack">
      <PageHeader title="Mensajes" subtitle="Conversaciones privadas entre familias y la escuela." actions={<Link to="/mensajes/nuevo" className="btn hide-mobile"><Plus size={18} /> Nuevo</Link>} />
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton count={6} h={72} />}
      {q.data && !q.data.length && (
        <Empty
          title="Sin conversaciones"
          text="Escribile a un docente, a preceptoría o a la dirección del nivel."
          icon={<MessageCircle size={36} strokeWidth={1.5} />}
          action={<Link to="/mensajes/nuevo" className="btn">Nuevo mensaje</Link>}
        />
      )}
      {!!q.data?.length && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {q.data.map((t) => {
            const other = t.others?.[0];
            const names = t.others?.map((o) => o.name).join(', ') ?? '';
            return (
              <Link key={t.id} to={`/mensajes/${t.id}`} className={`list-item ${t.unread ? 'unread' : ''}`}>
                <Avatar name={other?.name ?? '?'} src={other?.avatar} />
                <div className="grow">
                  <div className="row-between">
                    <span className="h3 truncate">{names}</span>
                    <span className="xs muted" style={{ flexShrink: 0 }}>{timeAgo(t.lastMessageAt)}</span>
                  </div>
                  <div className="xs muted truncate">
                    {other?.roleLabel}
                    {t.studentFirstName && ` · ${t.studentFirstName} ${t.studentLastName}`}
                  </div>
                  <div className="row" style={{ marginTop: 2 }}>
                    <span className="small truncate grow" style={{ fontWeight: t.unread ? 700 : 400 }}>
                      <b>{t.subject}:</b> {t.lastMessagePreview}
                    </span>
                    {t.closedAt && <Lock size={14} className="muted" />}
                    {t.unread > 0 && <span className="count">{t.unread}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <Link to="/mensajes/nuevo" className="btn btn-accent fab hide-desktop"><Plus size={20} /> Nuevo</Link>
    </div>
  );
}
