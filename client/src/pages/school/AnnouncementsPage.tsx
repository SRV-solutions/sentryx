import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Megaphone, Paperclip, Plus, CheckCheck, AlertTriangle, Search, X, Clock, FileEdit, Archive, CalendarDays } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Empty, ErrorBox, PageHeader, Skeleton, Tabs, Badge, timeAgo, fullName, Avatar, fmtDate } from '../../ui';
import type { Paginated, PersonLite } from '../../school/types';
import { Entity, Action } from '../../school/permissions';

export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'SENT' | 'ARCHIVED';
export const STATUS_LABELS: Record<AnnouncementStatus, string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', SENT: 'Enviado', ARCHIVED: 'Archivado' };

interface InboxItem {
  id: number;
  title: string;
  preview: string;
  priority: 'NORMAL' | 'URGENT';
  requiresAck: boolean;
  audienceLabel: string;
  hasAttachments: boolean;
  createdAt: string;
  status: AnnouncementStatus;
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
  status: AnnouncementStatus;
  scheduledAt: string | null;
  sentAt: string | null;
}

/** Filtros de la bandeja. Se mandan como query string tal cual (ver api boxQuery). */
interface Filters {
  q: string;
  unread: boolean;
  pendingAck: boolean;
  priority: boolean;
  attachments: boolean;
  archived: boolean;
  status: AnnouncementStatus | '';
  from: string;
  to: string;
}
const EMPTY: Filters = { q: '', unread: false, pendingAck: false, priority: false, attachments: false, archived: false, status: '', from: '', to: '' };

const toQuery = (box: 'inbox' | 'sent', f: Filters) => {
  const p = new URLSearchParams({ box });
  if (f.q.trim()) p.set('q', f.q.trim());
  if (box === 'inbox') {
    if (f.unread) p.set('unread', 'true');
    if (f.pendingAck) p.set('pendingAck', 'true');
    if (f.archived) p.set('archived', 'true');
  } else if (f.status) p.set('status', f.status);
  if (f.priority) p.set('priority', 'URGENT');
  if (f.attachments) p.set('attachments', 'true');
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  return p.toString();
};

export const StatusBadge = ({ status, scheduledAt }: { status: AnnouncementStatus; scheduledAt?: string | null }) => {
  if (status === 'DRAFT') return <Badge tone="warn"><FileEdit size={12} /> Borrador</Badge>;
  if (status === 'SCHEDULED') return <Badge tone="info"><Clock size={12} /> Programado{scheduledAt ? ` · ${fmtDate(scheduledAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</Badge>;
  if (status === 'ARCHIVED') return <Badge><Archive size={12} /> Archivado</Badge>;
  return null;
};

/** Hook: valor con retardo, para no consultar en cada tecla. */
const useDebounced = (value: string, ms = 300) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

export default function AnnouncementsPage() {
  const { can } = useSchool();
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showDates, setShowDates] = useState(false);
  const q = useDebounced(filters.q);
  const query = toQuery(box, { ...filters, q });
  const list = useInfiniteQuery({
    queryKey: ['announcements', box, query],
    queryFn: ({ pageParam }) => apiGet<Paginated<InboxItem | SentItem>>(`/school/announcements?${query}&page=${pageParam}&limit=20`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.currentPage < last.pagination.totalPages ? last.pagination.currentPage + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const canPublish = can(Entity.ANNOUNCEMENTS, Action.CREATE);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = (key: 'unread' | 'pendingAck' | 'priority' | 'attachments' | 'archived') => set({ [key]: !filters[key] });
  const active = query !== toQuery(box, EMPTY);

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button type="button" key={label} className={`chip ${on ? 'active' : ''}`} onClick={onClick}>{label}</button>
  );

  return (
    <div className="stack">
      <PageHeader
        title="Comunicados"
        actions={canPublish && <Link to="/comunicados/nuevo" className="btn hide-mobile"><Plus size={18} /> Nuevo</Link>}
      />
      {canPublish && (
        <Tabs value={box} onChange={(b) => (setBox(b), setFilters(EMPTY))} items={[{ value: 'inbox', label: 'Recibidos' }, { value: 'sent', label: 'Enviados' }]} />
      )}

      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ position: 'relative' }}>
          <Search size={18} className="muted" style={{ position: 'absolute', left: 12, pointerEvents: 'none' }} />
          <input className="input" style={{ paddingLeft: 40, paddingRight: filters.q ? 40 : undefined }} placeholder="Buscar por título o texto…" value={filters.q} onChange={(e) => set({ q: e.target.value })} aria-label="Buscar comunicados" />
          {filters.q && (
            <button type="button" className="icon-btn" style={{ position: 'absolute', right: 4 }} onClick={() => set({ q: '' })} aria-label="Limpiar búsqueda"><X size={16} /></button>
          )}
        </div>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {box === 'inbox' ? (
            <>
              {chip('Sin leer', filters.unread, () => toggle('unread'))}
              {chip('Pendientes de confirmar', filters.pendingAck, () => toggle('pendingAck'))}
            </>
          ) : (
            <>
              {chip('Todos', !filters.status, () => set({ status: '' }))}
              {chip('Borradores', filters.status === 'DRAFT', () => set({ status: 'DRAFT' }))}
              {chip('Programados', filters.status === 'SCHEDULED', () => set({ status: 'SCHEDULED' }))}
              {chip('Enviados', filters.status === 'SENT', () => set({ status: 'SENT' }))}
              {chip('Archivados', filters.status === 'ARCHIVED', () => set({ status: 'ARCHIVED' }))}
            </>
          )}
          {chip('Urgentes', filters.priority, () => toggle('priority'))}
          {chip('Con adjuntos', filters.attachments, () => toggle('attachments'))}
          {box === 'inbox' && chip('Archivados', filters.archived, () => toggle('archived'))}
          <button type="button" className={`chip ${showDates || filters.from || filters.to ? 'active' : ''}`} onClick={() => setShowDates((v) => !v)}><CalendarDays size={14} /> Fechas</button>
          {active && <button type="button" className="chip" onClick={() => (setFilters(EMPTY), setShowDates(false))}><X size={14} /> Limpiar</button>}
        </div>
        {showDates && (
          <div className="row wrap" style={{ gap: 8 }}>
            <label className="row small" style={{ gap: 6 }}>Desde <input type="date" className="input" style={{ minHeight: 36 }} value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label>
            <label className="row small" style={{ gap: 6 }}>Hasta <input type="date" className="input" style={{ minHeight: 36 }} value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label>
          </div>
        )}
      </div>

      {list.error && <ErrorBox error={list.error} retry={() => list.refetch()} />}
      {list.isLoading && <Skeleton count={5} h={86} />}
      {!list.isLoading && !items.length && (
        <Empty
          title={active ? 'Nada coincide con la búsqueda' : box === 'inbox' ? 'No hay comunicados' : 'Todavía no enviaste comunicados'}
          text={active ? 'Probá con otras palabras o quitá los filtros.' : undefined}
          icon={<Megaphone size={36} strokeWidth={1.5} />}
        />
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
                      {a.status === 'ARCHIVED' && <StatusBadge status="ARCHIVED" />}
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
                const pending = a.status === 'DRAFT' || a.status === 'SCHEDULED';
                return (
                  <Link key={a.id} to={`/comunicados/${a.id}`} className="list-item" style={{ alignItems: 'flex-start', opacity: a.status === 'ARCHIVED' ? 0.7 : 1 }}>
                    <div className="grow stack" style={{ gap: 6 }}>
                      <div className="row-between">
                        <span className="h3">{a.title}</span>
                        <span className="xs muted">{timeAgo(a.sentAt ?? a.createdAt)}</span>
                      </div>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <StatusBadge status={a.status} scheduledAt={a.scheduledAt} />
                        {a.priority === 'URGENT' && <Badge tone="danger"><AlertTriangle size={12} /> Urgente</Badge>}
                        <span className="small muted">Para: {a.audienceLabel}</span>
                      </div>
                      {pending ? (
                        <div className="xs muted">{a.recipientCount} destinatarios · {a.status === 'DRAFT' ? 'todavía no se envió' : 'se envía solo a la hora programada'}</div>
                      ) : (
                        <>
                          <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                          <div className="xs muted">
                            Leído por {read} de {a.recipientCount} ({pct}%){a.requiresAck && ` · ${a.ackCount} confirmaron`}
                          </div>
                        </>
                      )}
                    </div>
                  </Link>
                );
              })}
        </div>
      )}
      {list.hasNextPage && (
        <button className="btn btn-ghost" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          {list.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
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
