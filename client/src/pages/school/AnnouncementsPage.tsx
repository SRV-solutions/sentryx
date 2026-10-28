import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Megaphone, Paperclip, Plus, CheckCheck, AlertTriangle, Search, X, Clock, FileEdit, Archive, CalendarDays, MessageCircle, Reply } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { Empty, ErrorBox, PageHeader, Skeleton, Tabs, Badge, timeAgo, fullName, Avatar, fmtDate } from '../../ui';
import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_CATEGORY_LABELS, type AnnouncementCategory, type Paginated, type PersonLite } from '../../school/types';
import { CategoryBadge, useDebounced } from '../../school/announcements';
import { ConversationsList } from './ThreadsPage';

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
  category?: AnnouncementCategory;
  allowReplies?: boolean;
  /** Mi conversación de respuesta con quien lo envió, si ya respondí. */
  myThreadId?: number | null;
}

interface SentItem {
  id: number;
  title: string;
  audienceLabel: string;
  requiresAck: boolean;
  priority: string;
  recipientCount: number;
  readCount: string | number;
  ackCount: string | number;
  createdAt: string;
  status: AnnouncementStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  category?: AnnouncementCategory;
  allowReplies?: boolean;
  replyCount?: number;
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
  category: AnnouncementCategory | '';
  from: string;
  to: string;
}
const EMPTY: Filters = { q: '', unread: false, pendingAck: false, priority: false, attachments: false, archived: false, status: '', category: '', from: '', to: '' };

const toQuery = (box: 'inbox' | 'sent', f: Filters) => {
  const p = new URLSearchParams({ box });
  if (f.q.trim()) p.set('q', f.q.trim());
  if (box === 'inbox') {
    if (f.unread) p.set('unread', 'true');
    if (f.pendingAck) p.set('pendingAck', 'true');
    if (f.archived) p.set('archived', 'true');
  } else if (f.status) p.set('status', f.status);
  if (f.category) p.set('category', f.category);
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


type Tab = 'recibidos' | 'conversaciones' | 'enviados';
const TABS: Tab[] = ['recibidos', 'conversaciones', 'enviados'];

/** Etiqueta de pestaña con su contador de no leídos (el texto queda primero: los tutoriales lo buscan). */
const tabLabel = (text: string, n: number): ReactNode => (
  <span className="row" style={{ gap: 6, justifyContent: 'center' }}>{text}{n > 0 && <span className="count">{n > 99 ? '99+' : n}</span>}</span>
);

/**
 * Bandeja única de comunicación: lo que me mandaron, las conversaciones privadas (respuestas a comunicados
 * y chats) y lo que envié. Todos pueden enviar: el personal a su alcance, las familias y estudiantes a sus
 * docentes y a la escuela.
 */
export default function AnnouncementsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'recibidos';
  const box = tab === 'enviados' ? 'sent' : 'inbox';
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showDates, setShowDates] = useState(false);
  const q = useDebounced(filters.q);
  const query = toQuery(box, { ...filters, q });
  const list = useInfiniteQuery({
    queryKey: ['announcements', box, query],
    queryFn: ({ pageParam }) => apiGet<Paginated<InboxItem | SentItem>>(`/school/announcements?${query}&page=${pageParam}&limit=20`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.currentPage < last.pagination.totalPages ? last.pagination.currentPage + 1 : undefined),
    enabled: tab !== 'conversaciones',
  });
  // Mismas claves que AppShell: comparten caché y se refrescan con los sockets.
  const unreadAnn = useQuery({ queryKey: ['badge', 'announcements'], queryFn: () => apiGet<{ count: number }>('/school/announcements/unread-count') }).data?.count ?? 0;
  const unreadThreads = useQuery({ queryKey: ['badge', 'threads'], queryFn: () => apiGet<{ count: number }>('/school/threads/unread-count') }).data?.count ?? 0;
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = (key: 'unread' | 'pendingAck' | 'priority' | 'attachments' | 'archived') => set({ [key]: !filters[key] });
  const active = tab === 'conversaciones' ? !!filters.q.trim() || filters.unread : query !== toQuery(box, EMPTY);
  const changeTab = (t: Tab) => {
    setParams((p) => {
      if (t === 'recibidos') p.delete('tab');
      else p.set('tab', t);
      return p;
    }, { replace: true });
    setFilters(EMPTY);
    setShowDates(false);
  };

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button type="button" key={label} className={`chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={onClick}>{label}</button>
  );

  return (
    <div className="stack">
      <PageHeader title="Comunicados" actions={<Link to="/comunicados/nuevo" className="btn hide-mobile"><Plus size={18} /> Nuevo comunicado</Link>} />
      <Tabs
        value={tab}
        onChange={changeTab}
        items={[
          { value: 'recibidos', label: tabLabel('Recibidos', unreadAnn) },
          { value: 'conversaciones', label: tabLabel('Conversaciones', unreadThreads) },
          { value: 'enviados', label: 'Enviados' },
        ]}
      />

      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ position: 'relative' }}>
          <Search size={18} className="muted" style={{ position: 'absolute', left: 12, pointerEvents: 'none' }} />
          <input
            className="input"
            style={{ paddingLeft: 40, paddingRight: filters.q ? 40 : undefined }}
            placeholder={tab === 'conversaciones' ? 'Buscar por persona, alumno o texto…' : 'Buscar por título o texto…'}
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            aria-label={tab === 'conversaciones' ? 'Buscar conversaciones' : 'Buscar comunicados'}
          />
          {filters.q && (
            <button type="button" className="icon-btn" style={{ position: 'absolute', right: 4 }} onClick={() => set({ q: '' })} aria-label="Limpiar búsqueda"><X size={16} /></button>
          )}
        </div>
        {tab === 'conversaciones' ? (
          <div className="chips">
            {chip('Sin leer', filters.unread, () => toggle('unread'))}
            {active && <button type="button" className="chip" onClick={() => setFilters(EMPTY)}><X size={14} /> Limpiar</button>}
          </div>
        ) : (
          <>
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
            {/* Los tipos van en una fila deslizable aparte: son muchos y en el celular no deben empujar los otros filtros. */}
            <div className="chips" role="group" aria-label="Filtrar por tipo">
              {chip('Todos los tipos', !filters.category, () => set({ category: '' }))}
              {ANNOUNCEMENT_CATEGORIES.map((c) => chip(ANNOUNCEMENT_CATEGORY_LABELS[c], filters.category === c, () => set({ category: filters.category === c ? '' : c })))}
            </div>
            {showDates && (
              <div className="row wrap" style={{ gap: 8 }}>
                <label className="row small" style={{ gap: 6 }}>Desde <input type="date" className="input" style={{ minHeight: 36 }} value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label>
                <label className="row small" style={{ gap: 6 }}>Hasta <input type="date" className="input" style={{ minHeight: 36 }} value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label>
              </div>
            )}
          </>
        )}
      </div>

      {tab === 'conversaciones' ? (
        <ConversationsList q={q} unreadOnly={filters.unread} />
      ) : (
        <>
          {list.error && <ErrorBox error={list.error} retry={() => list.refetch()} />}
          {list.isLoading && <Skeleton count={5} h={86} />}
          {!list.isLoading && !list.error && !items.length && (
            <Empty
              title={active ? 'Nada coincide con la búsqueda' : box === 'inbox' ? 'No hay comunicados' : 'Todavía no enviaste comunicados'}
              text={active ? 'Probá con otras palabras o quitá los filtros.' : box === 'sent' ? 'Lo que envíes aparece acá, con quién lo leyó y sus respuestas.' : undefined}
              icon={<Megaphone size={36} strokeWidth={1.5} />}
              action={!active && box === 'sent' ? <Link to="/comunicados/nuevo" className="btn">Nuevo comunicado</Link> : undefined}
            />
          )}

          {items.length > 0 && (
            <div className="card list" style={{ overflow: 'hidden' }}>
              {box === 'inbox'
                ? (items as InboxItem[]).map((a) => (
                    <Link key={a.id} to={`/comunicados/${a.id}`} className={`list-item ${a.readAt ? '' : 'unread'}`} style={{ alignItems: 'flex-start' }}>
                      <Avatar name={fullName(a.author)} src={a.author?.avatar} />
                      <div className="grow" style={{ minWidth: 0 }}>
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
                          <CategoryBadge category={a.category} />
                          {a.status === 'ARCHIVED' && <StatusBadge status="ARCHIVED" />}
                          {a.priority === 'URGENT' && <Badge tone="danger"><AlertTriangle size={12} /> Urgente</Badge>}
                          {a.requiresAck && (a.ackAt ? <Badge tone="ok"><CheckCheck size={12} /> Confirmado</Badge> : <Badge tone="warn">Requiere confirmación</Badge>)}
                          {a.hasAttachments && <Badge><Paperclip size={12} /> Adjunto</Badge>}
                          {a.children.length > 0 && <Badge tone="info">{a.children.join(', ')}</Badge>}
                          {a.myThreadId ? (
                            <span className="xs row" style={{ gap: 4, color: 'var(--primary)', fontWeight: 700 }}><MessageCircle size={12} /> Ver conversación</span>
                          ) : a.allowReplies && a.status === 'SENT' ? (
                            <span className="xs muted row" style={{ gap: 4 }}><Reply size={12} /> Admite respuestas</span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  ))
                : (items as SentItem[]).map((a) => {
                    const read = Number(a.readCount);
                    const pct = a.recipientCount ? Math.round((read / a.recipientCount) * 100) : 0;
                    const pending = a.status === 'DRAFT' || a.status === 'SCHEDULED';
                    const replies = Number(a.replyCount ?? 0);
                    return (
                      <Link key={a.id} to={`/comunicados/${a.id}`} className="list-item" style={{ alignItems: 'flex-start', opacity: a.status === 'ARCHIVED' ? 0.7 : 1 }}>
                        <div className="grow stack" style={{ gap: 6, minWidth: 0 }}>
                          <div className="row-between" style={{ alignItems: 'flex-start' }}>
                            <span className="h3">{a.title}</span>
                            <span className="xs muted" style={{ flexShrink: 0 }}>{timeAgo(a.sentAt ?? a.createdAt)}</span>
                          </div>
                          <div className="row wrap" style={{ gap: 6 }}>
                            <CategoryBadge category={a.category} />
                            <StatusBadge status={a.status} scheduledAt={a.scheduledAt} />
                            {a.priority === 'URGENT' && <Badge tone="danger"><AlertTriangle size={12} /> Urgente</Badge>}
                            {replies > 0 ? (
                              <Badge tone="info"><MessageCircle size={12} /> {replies} {replies === 1 ? 'respuesta' : 'respuestas'}</Badge>
                            ) : a.allowReplies ? (
                              <span className="xs muted row" style={{ gap: 4 }}><Reply size={12} /> Admite respuestas</span>
                            ) : null}
                          </div>
                          <span className="small muted truncate">Para: {a.audienceLabel}</span>
                          {pending ? (
                            <div className="xs muted">{a.recipientCount} destinatarios · {a.status === 'DRAFT' ? 'todavía no se envió' : 'se envía solo a la hora programada'}</div>
                          ) : (
                            <>
                              <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                              <div className="xs muted">
                                Leído por {read} de {a.recipientCount} ({pct}%){a.requiresAck && ` · ${Number(a.ackCount)} confirmaron`}
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
        </>
      )}
      <Link to="/comunicados/nuevo" className="btn btn-accent fab hide-desktop" aria-label="Nuevo comunicado">
        <Plus size={20} /> Nuevo
      </Link>
    </div>
  );
}
