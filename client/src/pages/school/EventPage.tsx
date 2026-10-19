import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Clock, MapPin, Pencil, Trash2, UserPlus, X, CheckSquare, Square, Link2, Paperclip, StickyNote, ListTodo, Ban } from 'lucide-react';
import { apiGet, apiSend, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../school/SchoolContext';
import { Avatar, Badge, Card, ErrorBox, Field, Sheet, Skeleton, timeAgo, useToast } from '../../ui';
import { Entity, Action } from '../../school/permissions';
import { PLAN_NAMES, PlanCode } from '../../school/plans';
import { EventFormSheet } from '../../school/EventForm';
import { EventPostRow, SchoolEvent, dayLabel } from '../../school/events';

type EventDetail = SchoolEvent & { posts: EventPostRow[] };
interface Member { userId: number; name: string; category: string; plan: PlanCode }

/** Elegir encargados: personal del colegio (con su plan: se necesita Integral). */
const ManagersSheet = ({ event, open, onClose }: { event: EventDetail; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const staff = useQuery({ queryKey: ['plan-members', 'staff'], queryFn: () => apiGet<{ members: Member[] }>('/school/plans/members'), enabled: open });
  const [list, setList] = useState(event.Managers?.map((m) => ({ userId: m.userId, task: m.task ?? '' })) ?? []);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => apiSend('PUT', `/school/events/${event.id}/managers`, { managers: list.map((m) => ({ userId: m.userId, task: m.task || null })) }),
    onSuccess: () => (toast('Encargados actualizados: les avisamos'), qc.invalidateQueries({ queryKey: ['event', event.id] }), onClose()),
    onError: (e: Error) => setError(e.message),
  });
  const people = (staff.data?.members ?? []).filter((m) => m.category === 'DOCENTE' || m.category === 'DIRECTIVO');
  const name = (id: number) => people.find((p) => p.userId === id)?.name ?? event.Managers?.find((m) => m.userId === id)?.User?.lastName ?? `#${id}`;
  const candidates = people.filter((p) => !list.some((m) => m.userId === p.userId) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 8);
  return (
    <Sheet open={open} onClose={onClose} title="Encargados del acto">
      <div className="stack">
        {list.map((m, i) => (
          <div key={m.userId} className="row" style={{ gap: 6 }}>
            <span className="small grow truncate" style={{ fontWeight: 700 }}>{name(m.userId)}</span>
            <input className="input" style={{ width: 160 }} placeholder="A cargo de… (ej: Música)" maxLength={120} value={m.task} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, task: e.target.value } : x)))} />
            <button className="icon-btn" aria-label="Quitar" onClick={() => setList(list.filter((_x, j) => j !== i))}><X size={16} /></button>
          </div>
        ))}
        <input className="input" placeholder="Buscar docente o directivo para agregar" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="card list" style={{ overflow: 'hidden' }}>
          {candidates.map((p) => (
            <button key={p.userId} className="list-item" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: p.plan === 'INTEGRAL' ? 'pointer' : 'not-allowed', opacity: p.plan === 'INTEGRAL' ? 1 : 0.55 }} disabled={p.plan !== 'INTEGRAL'} onClick={() => setList([...list, { userId: p.userId, task: '' }])}>
              <span className="grow small">{p.name}</span>
              {p.plan === 'INTEGRAL' ? <UserPlus size={16} /> : <Badge>Plan {PLAN_NAMES[p.plan]}: necesita Integral</Badge>}
            </button>
          ))}
        </div>
        {error && <div className="alert alert-danger small">{error}</div>}
        <button className="btn btn-block" disabled={save.isPending} onClick={() => (setError(''), save.mutate())}>{save.isPending ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </Sheet>
  );
};

/** Espacio de trabajo del acto: notas, tareas, links y archivos de los encargados. */
const Workspace = ({ event }: { event: EventDetail }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { can } = useSchool();
  const me = user?.userData.id;
  const [kind, setKind] = useState<'NOTA' | 'TAREA' | 'LINK'>('TAREA');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [assigneeId, setAssigneeId] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['event', event.id] });
  const create = useMutation({
    mutationFn: (payload: object) => apiSend('POST', `/school/events/${event.id}/posts`, payload),
    onSuccess: () => (setBody(''), setUrl(''), setDueDate(''), setAssigneeId(''), refresh()),
    onError: (e: Error) => toast(e.message, true),
  });
  const update = useMutation({ mutationFn: ({ id, done }: { id: number; done: boolean }) => apiSend('PATCH', `/school/event-posts/${id}`, { done }), onSuccess: refresh, onError: (e: Error) => toast(e.message, true) });
  const remove = useMutation({ mutationFn: (id: number) => apiSend('DELETE', `/school/event-posts/${id}`), onSuccess: refresh, onError: (e: Error) => toast(e.message, true) });
  const attach = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadFile(file, { purpose: 'EVENT' });
      create.mutate({ kind: 'ARCHIVO', body: body || file.name, fileIds: [up.fileId] });
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setUploading(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (kind === 'LINK') create.mutate({ kind, url, body });
    else create.mutate({ kind, body, assigneeId: kind === 'TAREA' && assigneeId ? assigneeId : null, dueDate: kind === 'TAREA' && dueDate ? dueDate : null });
  };
  const tasks = event.posts.filter((p) => p.kind === 'TAREA');
  const others = event.posts.filter((p) => p.kind !== 'TAREA');
  const managerName = (id: number | null) => event.Managers?.find((m) => m.userId === id)?.User?.firstName;
  const icon = { NOTA: <StickyNote size={16} />, LINK: <Link2 size={16} />, ARCHIVO: <Paperclip size={16} />, TAREA: <ListTodo size={16} /> };

  return (
    <div className="stack">
      <h2 className="h2">Espacio del acto</h2>
      {tasks.length > 0 && (
        <Card>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row-between"><h3 className="h3">Tareas</h3><span className="xs muted">{tasks.filter((t) => t.done).length} de {tasks.length} hechas</span></div>
            {tasks.map((t) => (
              <div key={t.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <button className="icon-btn" aria-label={t.done ? 'Marcar pendiente' : 'Marcar hecha'} disabled={!event.canWork} onClick={() => update.mutate({ id: t.id, done: !t.done })}>{t.done ? <CheckSquare size={18} className="accent" /> : <Square size={18} />}</button>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small" style={{ textDecoration: t.done ? 'line-through' : undefined, whiteSpace: 'pre-wrap' }}>{t.body}</div>
                  <div className="xs muted">{t.assigneeId ? `Para ${managerName(t.assigneeId) ?? 'encargado/a'}` : 'Sin asignar'}{t.dueDate ? ` · antes del ${t.dueDate.split('-').reverse().slice(0, 2).join('/')}` : ''}</div>
                </div>
                {(t.authorId === me || can(Entity.EVENTS, Action.UPDATE)) && <button className="icon-btn" aria-label="Borrar" onClick={() => remove.mutate(t.id)}><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
        </Card>
      )}
      {others.map((p) => (
        <Card key={p.id}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <Avatar name={`${p.Author?.firstName} ${p.Author?.lastName}`} src={p.Author?.avatar} size="sm" />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="xs muted row" style={{ gap: 4 }}>{icon[p.kind]} {p.Author?.firstName} {p.Author?.lastName} · {timeAgo(p.createdAt)}</div>
              {p.body && <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{p.body}</div>}
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="small truncate" style={{ display: 'block' }}>{p.url}</a>}
              {p.files.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="row small" style={{ gap: 4 }}><Paperclip size={14} /> {f.name}</a>)}
            </div>
            {(p.authorId === me || can(Entity.EVENTS, Action.UPDATE)) && <button className="icon-btn" aria-label="Borrar" onClick={() => remove.mutate(p.id)}><Trash2 size={14} /></button>}
          </div>
        </Card>
      ))}
      {!event.posts.length && <p className="small muted">Todavía no hay nada. Cargá el guion, las tareas de cada uno, la música o los links que necesiten.</p>}
      {event.canWork && (
        <Card>
          <form className="stack" onSubmit={submit}>
            <div className="chips">
              {(['TAREA', 'NOTA', 'LINK'] as const).map((k) => <button type="button" key={k} className={`chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{k === 'TAREA' ? 'Tarea' : k === 'NOTA' ? 'Nota' : 'Link'}</button>)}
            </div>
            {kind === 'LINK' && <input className="input" type="url" required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />}
            <textarea className="textarea" rows={2} maxLength={5000} required={kind !== 'LINK'} placeholder={kind === 'TAREA' ? 'Ej: Ensayar la canción con 4º grado' : kind === 'NOTA' ? 'Ej: Guion del acto, orden de los números…' : 'Descripción (opcional)'} value={body} onChange={(e) => setBody(e.target.value)} />
            {kind === 'TAREA' && (
              <div className="grid grid-2">
                <Field label="Para">
                  <select className="select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">Sin asignar</option>
                    {event.Managers?.map((m) => <option key={m.userId} value={m.userId}>{m.User?.firstName} {m.User?.lastName}</option>)}
                  </select>
                </Field>
                <Field label="Antes del"><input className="input" type="date" value={dueDate} max={event.date} onChange={(e) => setDueDate(e.target.value)} /></Field>
              </div>
            )}
            <div className="row" style={{ gap: 6 }}>
              <button className="btn grow" disabled={create.isPending}>Agregar</button>
              <label className="btn btn-ghost" aria-label="Adjuntar archivo">
                <Paperclip size={16} /> {uploading ? 'Subiendo…' : 'Archivo'}
                <input type="file" hidden onChange={(e) => (attach(e.target.files?.[0]), (e.target.value = ''))} disabled={uploading} />
              </label>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
};

export default function EventPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can, session } = useSchool();
  const event = useQuery({ queryKey: ['event', id], queryFn: () => apiGet<EventDetail>(`/school/events/${id}`) });
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const cancel = useMutation({
    mutationFn: (cancelled: boolean) => apiSend('PATCH', `/school/events/${id}`, { cancelled }),
    onSuccess: (_r, cancelled) => (toast(cancelled ? 'Evento suspendido: avisamos a los encargados' : 'Evento reactivado'), qc.invalidateQueries({ queryKey: ['event', id] }), qc.invalidateQueries({ queryKey: ['events'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  const remove = useMutation({
    mutationFn: () => apiSend('DELETE', `/school/events/${id}`),
    onSuccess: () => (toast('Evento eliminado'), qc.invalidateQueries({ queryKey: ['events'] }), navigate('/calendario')),
    onError: (e: Error) => toast(e.message, true),
  });
  const e = event.data;
  return (
    <div className="stack-lg">
      <Link to="/calendario" className="row small muted"><ArrowLeft size={16} /> Calendario</Link>
      {event.error && <ErrorBox error={event.error} />}
      {!e && !event.error && <Skeleton count={2} h={90} />}
      {e && (
        <>
          <Card>
            <div className="stack" style={{ gap: 8 }}>
              <div className="row wrap" style={{ gap: 6 }}>
                <Badge tone={e.kind === 'ACTO' ? 'accent' : e.kind === 'FERIADO' ? 'danger' : 'info'}>{e.kindLabel}</Badge>
                {e.cancelled && <Badge tone="danger">Suspendido</Badge>}
                {e.audience === 'STAFF' && <Badge>Solo personal</Badge>}
              </div>
              <h1 className="h1" style={{ textDecoration: e.cancelled ? 'line-through' : undefined }}>{e.title}</h1>
              <div className="row small" style={{ gap: 6 }}><CalendarDays size={16} /> {dayLabel(e.date)}{e.endDate && e.endDate !== e.date ? ` al ${dayLabel(e.endDate)}` : ''}</div>
              {e.startTime && <div className="row small" style={{ gap: 6 }}><Clock size={16} /> {e.startTime}{e.endTime ? ` a ${e.endTime}` : ''}</div>}
              {e.location && <div className="row small" style={{ gap: 6 }}><MapPin size={16} /> {e.location}</div>}
              {e.description && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.description}</p>}
              {can(Entity.EVENTS, Action.UPDATE) && (
                <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>
                  <button className="btn btn-sm btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(!e.cancelled)}><Ban size={14} /> {e.cancelled ? 'Reactivar' : 'Suspender'}</button>
                  {can(Entity.EVENTS, Action.DELETE) && <button className="btn btn-sm btn-ghost" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 size={14} /> Eliminar</button>}
                </div>
              )}
            </div>
          </Card>
          {session?.isStaff && (
            <Card>
              <div className="stack" style={{ gap: 8 }}>
                <div className="row-between">
                  <h2 className="h3">Encargados</h2>
                  {can(Entity.EVENTS, Action.UPDATE) && <button className="btn btn-sm btn-ghost" onClick={() => setManaging(true)}><UserPlus size={14} /> Designar</button>}
                </div>
                {!e.Managers?.length && <p className="small muted">Sin encargados todavía.</p>}
                <div className="row wrap" style={{ gap: 6 }}>
                  {e.Managers?.map((m) => (
                    <span key={m.userId} className="player-chip small">
                      <Avatar name={`${m.User?.firstName} ${m.User?.lastName}`} src={m.User?.avatar} size="sm" />
                      {m.User?.firstName} {m.User?.lastName}{m.task ? ` · ${m.task}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          )}
          {session?.isStaff && (e.canWork || e.posts.length > 0) && <Workspace event={e} />}
          <EventFormSheet open={editing} onClose={() => setEditing(false)} event={e} />
          {managing && <ManagersSheet event={e} open={managing} onClose={() => setManaging(false)} />}
        </>
      )}
    </div>
  );
}
