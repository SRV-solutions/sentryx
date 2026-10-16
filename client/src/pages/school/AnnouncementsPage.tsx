import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Megaphone, Paperclip, Plus, CheckCheck, AlertTriangle } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Empty, ErrorBox, PageHeader, Skeleton, Tabs, Badge, timeAgo, fullName, Avatar } from '../../ui';
import type { Paginated, PersonLite } from '../../school/types';

interface InboxItem {
  id: number;
  title: string;
  preview: string;
  priority: 'NORMAL' | 'URGENT';
  requiresAck: boolean;
  audienceLabel: string;
  hasAttachments: boolean;
  createdAt: string;
  author: PersonLite;
  readAt: string | null;
  ackAt: string | null;
  children: string[];
}

interface SentItem {
  id: number;
  title: string;
  audienceLabel: string;
  requiresAck: boolean;
  priority: string;
  recipientCount: number;
  readCount: string;
  ackCount: string;
  createdAt: string;
}

export default function AnnouncementsPage() {
  const { can } = useSchool();
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');
  const q = useInfiniteQuery({
    queryKey: ['announcements', box],
    queryFn: ({ pageParam }) => apiGet<Paginated<InboxItem | SentItem>>(`/school/announcements?box=${box}&page=${pageParam}&limit=20`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.currentPage < last.pagination.totalPages ? last.pagination.currentPage + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const canPublish = can('announcements.publish');

  return (
    <div className="stack">
      <PageHeader
        title="Comunicados"
        actions={canPublish && <Link to="/comunicados/nuevo" className="btn hide-mobile"><Plus size={18} /> Nuevo</Link>}
      />
      {canPublish && (
        <Tabs value={box} onChange={setBox} items={[{ value: 'inbox', label: 'Recibidos' }, { value: 'sent', label: 'Enviados' }]} />
      )}
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton count={5} h={86} />}
      {!q.isLoading && !items.length && (
        <Empty title={box === 'inbox' ? 'No hay comunicados' : 'Todavía no enviaste comunicados'} icon={<Megaphone size={36} strokeWidth={1.5} />} />
      )}

      {items.length > 0 && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {box === 'inbox'
            ? (items as InboxItem[]).map((a) => (
                <Link key={a.id} to={`/comunicados/${a.id}`} className={`list-item ${a.readAt ? '' : 'unread'}`} style={{ alignItems: 'flex-start' }}>
                  <Avatar name={fullName(a.author)} src={a.author?.avatar} />
                  <div className="grow">
                    <div className="row-between">
                      <span className="small muted truncate">{fullName(a.author)}</span>
                      <span className="xs muted" style={{ flexShrink: 0 }}>{timeAgo(a.createdAt)}</span>
                    </div>
                    <div className="h3" style={{ margin: '2px 0' }}>
                      {!a.readAt && <span className="dot" style={{ marginRight: 6 }} />}
                      {a.title}
                    </div>
                    <div className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.preview}</div>
                    <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
                      {a.priority === 'URGENT' && <Badge tone="danger"><AlertTriangle size={12} /> Urgente</Badge>}
                      {a.requiresAck && (a.ackAt ? <Badge tone="ok"><CheckCheck size={12} /> Confirmado</Badge> : <Badge tone="warn">Requiere confirmación</Badge>)}
                      {a.hasAttachments && <Badge><Paperclip size={12} /> Adjunto</Badge>}
                      {a.children.length > 0 && <Badge tone="info">{a.children.join(', ')}</Badge>}
                    </div>
                  </div>
                </Link>
              ))
            : (items as SentItem[]).map((a) => {
                const read = Number(a.readCount);
                const pct = a.recipientCount ? Math.round((read / a.recipientCount) * 100) : 0;
                return (
                  <Link key={a.id} to={`/comunicados/${a.id}`} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <div className="grow stack" style={{ gap: 6 }}>
                      <div className="row-between">
                        <span className="h3">{a.title}</span>
                        <span className="xs muted">{timeAgo(a.createdAt)}</span>
                      </div>
                      <div className="small muted">Para: {a.audienceLabel}</div>
                      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                      <div className="xs muted">
                        Leído por {read} de {a.recipientCount} ({pct}%){a.requiresAck && ` · ${a.ackCount} confirmaron`}
                      </div>
                    </div>
                  </Link>
                );
              })}
        </div>
      )}
      {q.hasNextPage && (
        <button className="btn btn-ghost" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {q.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
        </button>
      )}
      {canPublish && (
        <Link to="/comunicados/nuevo" className="btn btn-accent fab hide-desktop" aria-label="Nuevo comunicado">
          <Plus size={20} /> Nuevo
        </Link>
      )}
    </div>
  );
}
