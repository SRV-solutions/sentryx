import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Paperclip, Link2, FileText, Film, Image as ImageIcon, Pin, CalendarClock, Megaphone,
  Trash2, X, ClipboardCheck, BookOpenCheck, BarChart3, ExternalLink, CheckCheck,
} from 'lucide-react';
import { apiGet, apiSend, uploadFile, formatBytes, type UploadedFile } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Avatar, Badge, Chips, Empty, ErrorBox, Field, Sheet, Skeleton, Tabs, fmtDate, fullName, timeAgo, useToast } from '../../ui';
import type { PersonLite } from '../../school/types';
import { Entity, Action } from '../../school/permissions';

interface Classroom {
  division: { id: number; name: string; shift: string | null; level: { id: number; name: string; type: string } };
  subjects: Array<{ subject: { id: number; name: string }; teacher: PersonLite; mine: boolean }>;
  studentCount: number;
  students: PersonLite[];
  canPost: boolean;
  canAnnounce: boolean;
  asGuardian: boolean;
}

interface SignedFile { id: number; name: string; size: number; mimeType: string; url: string }
interface Post {
  id: number;
  kind: 'MATERIAL' | 'TAREA';
  title: string;
  body: string;
  links: Array<{ url: string; title?: string }>;
  files: SignedFile[];
  dueDate: string | null;
  pinned: boolean;
  createdAt: string;
  Subject: { id: number; name: string } | null;
  Author: PersonLite;
  canEdit: boolean;
}

interface AnnouncementRow {
  id: number;
  title: string;
  preview: string;
  priority: string;
  requiresAck: boolean;
  audienceLabel: string;
  createdAt: string;
  author: PersonLite;
  readAt: string | null;
  ackAt: string | null;
  isRecipient: boolean;
}

const youtubeId = (url: string) => url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/)?.[1];

const FileItem = ({ f }: { f: SignedFile }) => {
  if (f.mimeType.startsWith('image/'))
    return (
      <a href={f.url} target="_blank" rel="noreferrer">
        <img src={f.url} alt={f.name} loading="lazy" style={{ borderRadius: 12, maxHeight: 360, width: '100%', objectFit: 'cover', border: '1px solid var(--border)' }} />
      </a>
    );
  if (f.mimeType.startsWith('video/'))
    return <video src={f.url} controls preload="metadata" playsInline style={{ width: '100%', borderRadius: 12, background: '#000' }} />;
  if (f.mimeType.startsWith('audio/')) return <audio src={f.url} controls preload="none" style={{ width: '100%' }} />;
  return (
    <a href={f.url} target="_blank" rel="noreferrer" className="card row" style={{ padding: '10px 12px' }}>
      <FileText size={18} /> <span className="grow truncate small">{f.name}</span>
      <span className="xs muted">{formatBytes(f.size)}</span>
    </a>
  );
};

const PostCard = ({ p, onDelete }: { p: Post; onDelete: () => void }) => (
  <article className="card card-pad stack" style={{ gap: 10 }}>
    <div className="row">
      <Avatar name={fullName(p.Author)} src={p.Author.avatar} size="sm" />
      <div className="grow">
        <div className="small"><b>{fullName(p.Author)}</b>{p.Subject && <span className="muted"> · {p.Subject.name}</span>}</div>
        <div className="xs muted">{timeAgo(p.createdAt)}</div>
      </div>
      {p.pinned && <Pin size={16} className="accent" />}
      {p.canEdit && (
        <button className="icon-btn" onClick={() => confirm('¿Eliminar esta publicación? Los archivos quedan en "Archivos".') && onDelete()} aria-label="Eliminar"><Trash2 size={16} /></button>
      )}
    </div>
    <div className="row wrap" style={{ gap: 6 }}>
      {p.kind === 'TAREA' ? <Badge tone="warn"><CalendarClock size={12} /> Tarea{p.dueDate && ` · entrega ${fmtDate(p.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })}`}</Badge> : <Badge tone="info">Material</Badge>}
    </div>
    <h3 className="h2">{p.title}</h3>
    {p.body && <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{p.body}</p>}
    {p.links.map((l) => {
      const yt = youtubeId(l.url);
      return yt ? (
        <div key={l.url} style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
          <iframe src={`https://www.youtube-nocookie.com/embed/${yt}`} title={l.title ?? 'Video'} loading="lazy" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
        </div>
      ) : (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener" className="card row" style={{ padding: '10px 12px' }}>
          <ExternalLink size={16} /> <span className="grow truncate small">{l.title || l.url}</span>
        </a>
      );
    })}
    {p.files.map((f) => <FileItem key={f.id} f={f} />)}
  </article>
);

const Composer = ({ room, onClose }: { room: Classroom; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const mySubjects = room.subjects.filter((s) => s.mine);
  const options = mySubjects.length ? mySubjects : room.subjects;
  const [kind, setKind] = useState<'MATERIAL' | 'TAREA'>('MATERIAL');
  const [subjectId, setSubjectId] = useState<number | ''>(options[0]?.subject.id ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [notify, setNotify] = useState(true);

  const upload = async (list: FileList | null) => {
    for (const f of Array.from(list ?? [])) {
      try {
        setProgress(0);
        const up = await uploadFile(f, { purpose: 'MATERIAL', divisionId: room.division.id, subjectId: subjectId || null, onProgress: setProgress });
        setFiles((p) => [...p, up]);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Error al subir', true);
      } finally {
        setProgress(null);
      }
    }
  };

  const save = useMutation({
    mutationFn: () =>
      apiSend('POST', `/school/classrooms/${room.division.id}/posts`, {
        kind,
        subjectId: subjectId || null,
        title,
        body,
        dueDate: kind === 'TAREA' && dueDate ? dueDate : null,
        links: links.map((url) => ({ url })),
        fileIds: files.map((f) => f.fileId),
        notifyFamilies: notify,
      }),
    onSuccess: () => {
      toast('Publicado en el aula ✅');
      qc.invalidateQueries({ queryKey: ['classroom-posts', room.division.id] });
      qc.invalidateQueries({ queryKey: ['classrooms'] });
      onClose();
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const addLink = () => {
    try {
      const u = new URL(linkDraft.trim());
      setLinks((l) => [...l, u.toString()]);
      setLinkDraft('');
    } catch {
      toast('Link inválido (debe empezar con https://)', true);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length >= 2 && progress === null) save.mutate();
  };

  return (
    <Sheet open onClose={onClose} title={`Publicar en ${room.division.name}`}>
      <form className="stack" onSubmit={submit}>
        <Tabs value={kind} onChange={setKind} items={[{ value: 'MATERIAL', label: 'Material' }, { value: 'TAREA', label: 'Tarea' }]} />
        {options.length > 0 && (
          <Field label="Materia">
            <select className="select" value={subjectId} onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')}>
              {!mySubjects.length && <option value="">General</option>}
              {options.map((s) => <option key={s.subject.id} value={s.subject.id}>{s.subject.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder={kind === 'TAREA' ? 'Ej: TP Nº 2 — Fracciones' : 'Ej: Apunte de la clase del martes'} /></Field>
        <Field label="Descripción"><textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} /></Field>
        {kind === 'TAREA' && <Field label="Fecha de entrega"><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>}

        <div className="stack" style={{ gap: 8 }}>
          {links.map((l) => (
            <div key={l} className="row card" style={{ padding: '8px 12px' }}>
              {youtubeId(l) ? <Film size={16} /> : <Link2 size={16} />} <span className="grow truncate small">{l}</span>
              <button type="button" className="icon-btn" onClick={() => setLinks((x) => x.filter((y) => y !== l))} aria-label="Quitar"><X size={16} /></button>
            </div>
          ))}
          {files.map((f) => (
            <div key={f.fileId} className="row card" style={{ padding: '8px 12px' }}>
              {f.mimeType.startsWith('image/') ? <ImageIcon size={16} /> : f.mimeType.startsWith('video/') ? <Film size={16} /> : <Paperclip size={16} />}
              <span className="grow truncate small">{f.name}</span>
              <span className="xs muted">{formatBytes(f.size)}</span>
              <button type="button" className="icon-btn" onClick={() => setFiles((x) => x.filter((y) => y.fileId !== f.fileId))} aria-label="Quitar"><X size={16} /></button>
            </div>
          ))}
          {progress !== null && (
            <div><div className="xs muted">Subiendo… {progress}%</div><div className="progress"><span style={{ width: `${progress}%` }} /></div></div>
          )}
          <div className="row">
            <input className="input grow" placeholder="Pegar link (YouTube, Drive, web…)" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())} />
            <button type="button" className="btn btn-ghost" onClick={addLink} disabled={!linkDraft}><Link2 size={16} /></button>
          </div>
          <label className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
            <Paperclip size={16} /> Adjuntar archivos, fotos o videos
            <input type="file" hidden multiple accept="image/*,video/mp4,video/webm,video/quicktime,audio/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp,.txt" onChange={(e) => upload(e.target.files)} disabled={progress !== null} />
          </label>
          <span className="xs muted">Las fotos se optimizan automáticamente. Para videos largos conviene subirlos a YouTube (oculto) y pegar el link.</span>
        </div>
        <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Avisar a las familias del aula</label>
        <button className="btn btn-accent btn-block" disabled={save.isPending || progress !== null || title.trim().length < 2}>Publicar</button>
      </form>
    </Sheet>
  );
};

const Wall = ({ room }: { room: Classroom }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [subjectId, setSubjectId] = useState<number>(0);
  const [composing, setComposing] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ['classroom-posts', room.division.id, subjectId],
    queryFn: ({ pageParam }) =>
      apiGet<{ data: Post[]; hasMore: boolean }>(`/school/classrooms/${room.division.id}/posts?${subjectId ? `subjectId=${subjectId}&` : ''}${pageParam ? `before=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.data[last.data.length - 1]?.id : undefined),
  });
  const del = useMutation({
    mutationFn: (id: number) => apiSend('DELETE', `/school/classroom-posts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classroom-posts', room.division.id] }),
    onError: (e: Error) => toast(e.message, true),
  });
  const posts = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="stack">
      {room.subjects.length > 1 && (
        <Chips value={subjectId} onChange={setSubjectId} items={[{ value: 0, label: 'Todas' }, ...[...new Map(room.subjects.map((s) => [s.subject.id, s.subject])).values()].map((s) => ({ value: s.id, label: s.name }))]} />
      )}
      {room.canPost && (
        <button className="card card-pad row" style={{ cursor: 'pointer', textAlign: 'left', color: 'var(--text-3)' }} onClick={() => setComposing(true)}>
          <Plus size={18} /> Compartí material, un video o una tarea…
        </button>
      )}
      {q.isLoading && <Skeleton count={3} h={140} />}
      {q.error && <ErrorBox error={q.error} />}
      {!q.isLoading && !posts.length && <Empty title="Todavía no hay publicaciones" text={room.canPost ? 'Subí el primer material para el curso.' : 'Cuando los docentes compartan materiales y tareas, los vas a ver acá.'} />}
      {posts.map((p) => <PostCard key={p.id} p={p} onDelete={() => del.mutate(p.id)} />)}
      {q.hasNextPage && <button className="btn btn-ghost" onClick={() => q.fetchNextPage()}>Ver más</button>}
      {composing && <Composer room={room} onClose={() => setComposing(false)} />}
    </div>
  );
};

const Announcements = ({ room }: { room: Classroom }) => {
  const q = useQuery({
    queryKey: ['classroom-announcements', room.division.id],
    queryFn: () => apiGet<{ data: AnnouncementRow[] }>(`/school/classrooms/${room.division.id}/announcements`),
  });
  return (
    <div className="stack">
      {room.canAnnounce && (
        <Link to={`/comunicados/nuevo?division=${room.division.id}`} className="btn btn-sm" style={{ alignSelf: 'flex-start' }}><Megaphone size={16} /> Nuevo comunicado a {room.division.name}</Link>
      )}
      {q.isLoading && <Skeleton count={3} h={80} />}
      {q.data && !q.data.data.length && <Empty title="Sin comunicados para este curso" icon={<Megaphone size={36} strokeWidth={1.5} />} />}
      {!!q.data?.data.length && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {q.data.data.map((a) => (
            <Link key={a.id} to={`/comunicados/${a.id}`} className={`list-item ${a.isRecipient && !a.readAt ? 'unread' : ''}`} style={{ alignItems: 'flex-start' }}>
              <Avatar name={fullName(a.author)} src={a.author.avatar} size="sm" />
              <div className="grow">
                <div className="row-between"><span className="h3">{a.title}</span><span className="xs muted">{timeAgo(a.createdAt)}</span></div>
                <div className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.preview}</div>
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  <Badge>{a.audienceLabel}</Badge>
                  {a.requiresAck && a.isRecipient && (a.ackAt ? <Badge tone="ok"><CheckCheck size={12} /> Confirmado</Badge> : <Badge tone="warn">Requiere confirmación</Badge>)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const Members = ({ room }: { room: Classroom }) => {
  const teachers = [...new Map(room.subjects.map((s) => [s.teacher.id, { t: s.teacher, subjects: room.subjects.filter((x) => x.teacher.id === s.teacher.id).map((x) => x.subject.name) }])).values()];
  return (
    <div className="stack">
      <h2 className="h2">Docentes</h2>
      <div className="card list" style={{ overflow: 'hidden' }}>
        {teachers.map(({ t, subjects }) => (
          <div key={t.id} className="list-item">
            <Avatar name={fullName(t)} src={t.avatar} size="sm" />
            <div className="grow"><div className="h3">{fullName(t)}</div><div className="xs muted">{subjects.join(' · ')}</div></div>
            {room.asGuardian && <Link to={`/mensajes/nuevo?alumno=${room.students[0]?.id ?? ''}`} className="btn btn-sm btn-ghost">Escribir</Link>}
          </div>
        ))}
      </div>
      <h2 className="h2">{room.asGuardian ? `Alumnos (${room.studentCount})` : `Alumnos · ${room.studentCount}`}</h2>
      {room.asGuardian ? (
        <p className="small muted">Por privacidad, las familias solo ven a sus hijos. {room.students.map((s) => s.firstName).join(' y ')} {room.students.length > 1 ? 'cursan' : 'cursa'} en esta aula.</p>
      ) : (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {room.students.map((s) => (
            <Link key={s.id} to={`/alumnos/${s.id}`} className="list-item">
              <Avatar name={fullName(s)} src={s.photoUrl} size="sm" />
              <span className="grow">{s.lastName}, {s.firstName}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default function ClassroomPage() {
  const id = Number(useParams().id);
  const { can } = useSchool();
  const [tab, setTab] = useState<'wall' | 'announcements' | 'members'>('wall');
  const q = useQuery({ queryKey: ['classroom', id], queryFn: () => apiGet<Classroom>(`/school/classrooms/${id}`) });
  const room = q.data;

  return (
    <div className="stack-lg page-narrow" style={{ margin: '0 auto', width: '100%' }}>
      <Link to="/aulas" className="row small muted"><ArrowLeft size={16} /> Aulas</Link>
      {q.error && <ErrorBox error={q.error} />}
      {!room && !q.error && <Skeleton count={1} h={100} />}
      {room && (
        <>
          <div className="card card-pad stack" style={{ background: 'linear-gradient(135deg, var(--brand-blue), #063f86)', color: '#fff', border: 0 }}>
            <div className="xs" style={{ opacity: 0.85 }}>{room.division.level.name}{room.division.shift ? ` · Turno ${room.division.shift}` : ''}</div>
            <h1 className="h1" style={{ color: '#fff' }}>{room.division.name}<span style={{ color: 'var(--brand-orange)' }}>.</span></h1>
            <div className="small" style={{ opacity: 0.9 }}>{new Set(room.subjects.map((s) => s.teacher.id)).size} docentes · {room.studentCount} alumnos</div>
            {!room.asGuardian && (
              <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                {can(Entity.ATTENDANCE, Action.UPDATE) && <Link to="/asistencia" className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.15)' }}><ClipboardCheck size={14} /> Asistencia</Link>}
                {room.subjects.filter((s) => s.mine).map((s) => (
                  <Link key={s.subject.id} to={`/materias/${room.division.id}/${s.subject.id}`} className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.15)' }}><BookOpenCheck size={14} /> Notas {s.subject.name}</Link>
                ))}
                {can(Entity.GRADES, Action.READ) && <Link to={`/division/${room.division.id}`} className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.15)' }}><BarChart3 size={14} /> Estado académico</Link>}
              </div>
            )}
          </div>
          <Tabs value={tab} onChange={setTab} items={[{ value: 'wall', label: 'Muro' }, { value: 'announcements', label: 'Comunicados' }, { value: 'members', label: 'Integrantes' }]} />
          {tab === 'wall' && <Wall room={room} />}
          {tab === 'announcements' && <Announcements room={room} />}
          {tab === 'members' && <Members room={room} />}
        </>
      )}
    </div>
  );
}
