import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, Paperclip, Hash, Users, EyeOff, Eye, VolumeX, Volume2, ShieldCheck, MoreVertical } from 'lucide-react';
import { apiGet, apiSend, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/SocketContext';
import { useSchool } from '../../school/SchoolContext';
import { PersonSheet } from '../../school/PersonProfile';
import { Avatar, ErrorBox, Sheet, Skeleton, fmtDate, useToast, Field, Badge } from '../../ui';
import type { AttachmentRef } from '../../school/types';

interface Msg {
  id: number;
  senderId: number;
  sender?: { id: number; firstName: string; lastName: string; avatar: string | null };
  body: string | null;
  hidden: boolean;
  createdAt: string;
  attachments: AttachmentRef[];
}
interface ChannelData {
  channel: { id: number; name: string; division: { id: number; name: string }; subject: { id: number; name: string } | null; role: 'member' | 'moderator' };
  teacherIds: number[];
  studentCount: number;
  mutedUntil: string | null;
  mutes: Array<{ userId: number; until: string }>;
  messages: Msg[];
  hasMore: boolean;
}
interface Member { id: number; firstName: string; lastName: string; avatar: string | null; kind: 'DOCENTE' | 'ESTUDIANTE' }

const time = (d: string) => new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

/** Canal de curso. Moderadores (docentes, preceptoría, conducción): ocultan mensajes y silencian alumnos. */
export default function ChannelPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const me = user?.userData.id ?? 0;
  const { session } = useSchool();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [actionsFor, setActionsFor] = useState<Msg | null>(null);
  const [muteTarget, setMuteTarget] = useState<{ id: number; name: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const key = ['channel', id];

  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => apiGet<ChannelData>(`/school/channels/${id}${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.id : undefined),
  });
  const first = q.data?.pages[0];
  const moderator = first?.channel.role === 'moderator';
  const messages = q.data ? [...q.data.pages].reverse().flatMap((p) => p.messages) : [];

  useEffect(() => {
    if (q.isSuccess) {
      qc.invalidateQueries({ queryKey: ['badge', 'channels'] });
      qc.invalidateQueries({ queryKey: ['channels'] });
    }
  }, [q.isSuccess, qc]);

  const append = useCallback(
    (m: Msg) =>
      qc.setQueryData<InfiniteData<ChannelData>>(key, (old) => {
        if (!old || old.pages[0].messages.some((x) => x.id === m.id)) return old;
        const [head, ...rest] = old.pages;
        return { ...old, pages: [{ ...head, messages: [...head.messages, m] }, ...rest] };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, qc]
  );
  useSocketEvent(
    'channel_message',
    useCallback(
      (p: { channelId: number; message: Msg }) => {
        if (p.channelId !== id) return;
        append(p.message);
        if (p.message.senderId !== me) apiSend('POST', `/school/channels/${id}/read`).catch(() => {});
      },
      [id, me, append]
    )
  );
  useSocketEvent(
    'channel_moderation',
    useCallback((p: { channelId: number }) => p.channelId === id && qc.invalidateQueries({ queryKey: key }), [id, qc]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Al llegar mensajes nuevos, bajar hasta el último (el efecto no debe devolver nada).
  useLayoutEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (payload: { body: string; attachments?: object[] }) => apiSend<Msg>('POST', `/school/channels/${id}/messages`, payload),
    onSuccess: append,
    onError: (e: Error) => toast(e.message, true),
  });
  const moderate = useMutation({
    mutationFn: ({ msg, action }: { msg: Msg; action: 'hide' | 'unhide' }) => apiSend('POST', `/school/channel-messages/${msg.id}/${action}`),
    onSuccess: (_r, v) => (qc.invalidateQueries({ queryKey: key }), toast(v.action === 'hide' ? 'Mensaje ocultado' : 'Mensaje visible otra vez'), setActionsFor(null)),
    onError: (e: Error) => toast(e.message, true),
  });
  const unmute = useMutation({
    mutationFn: (userId: number) => apiSend('DELETE', `/school/channels/${id}/mute/${userId}`),
    onSuccess: () => (qc.invalidateQueries({ queryKey: key }), toast('Silencio levantado'), setActionsFor(null)),
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    send.mutate({ body });
  };
  const attach = async (f?: File) => {
    if (!f) return;
    try {
      const up = await uploadFile(f, { purpose: 'MESSAGE' });
      send.mutate({ body: `📎 ${up.name}`, attachments: [{ fileId: up.fileId }] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al subir', true);
    }
  };

  if (q.error) return <ErrorBox error={q.error} />;
  if (!first) return <Skeleton count={6} h={50} />;
  const teachers = new Set(first.teacherIds);
  const mutedUntil = first.mutedUntil && new Date(first.mutedUntil) > new Date() ? first.mutedUntil : null;
  const mutedSet = new Map(first.mutes.map((m) => [m.userId, m.until]));
  let lastDay = '';

  return (
    <div className="page-narrow" style={{ margin: '0 auto', width: '100%' }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <Link to="/canales" className="icon-btn" aria-label="Volver"><ArrowLeft size={20} /></Link>
        <button className="row grow" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer', minWidth: 0, gap: 10 }} onClick={() => setMembersOpen(true)}>
          <span className="avatar avatar-sm"><Hash size={16} /></span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="h3 truncate" style={{ display: 'block' }}>{first.channel.subject?.name ?? 'General'} · {first.channel.division.name}</span>
            <span className="xs muted truncate" style={{ display: 'block' }}>
              {first.teacherIds.length} docente{first.teacherIds.length === 1 ? '' : 's'} · {first.studentCount} estudiantes{moderator ? ' · Moderás este canal' : ''}
            </span>
          </span>
          <Users size={18} className="muted" />
        </button>
      </div>

      {!moderator && (
        <div className="alert alert-info xs" style={{ marginBottom: 8 }}>
          <ShieldCheck size={16} /> Canal del curso: lo leen tus docentes y preceptoría. Respetá a tus compañeros.
        </div>
      )}

      {q.hasNextPage && (
        <button className="btn btn-sm btn-ghost btn-block" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>Ver mensajes anteriores</button>
      )}

      <div className="chat">
        {!messages.length && <div className="bubble bubble-system">Todavía no hay mensajes. ¡Escribí el primero!</div>}
        {messages.map((m) => {
          const day = fmtDate(m.createdAt, { weekday: 'long', day: 'numeric', month: 'long' });
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.senderId === me;
          const isTeacher = teachers.has(m.senderId);
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showDay && <div className="bubble bubble-system">{day}</div>}
              <div className={`bubble ${mine ? 'bubble-me' : 'bubble-other'}`} style={m.hidden ? { opacity: 0.6 } : undefined}>
                {!mine && m.sender && (
                  <button className="xs" style={{ display: 'block', background: 'none', border: 0, padding: 0, marginBottom: 2, fontWeight: 800, color: isTeacher ? 'var(--accent)' : 'var(--primary)', cursor: 'pointer' }} onClick={() => setProfileId(m.senderId)}>
                    {m.sender.firstName} {m.sender.lastName}{isTeacher ? ' · Docente' : ''}
                  </button>
                )}
                {m.hidden && !m.body ? <i>Mensaje ocultado por moderación</i> : m.body}
                {m.hidden && m.body && <div className="xs" style={{ marginTop: 4 }}><EyeOff size={12} /> Oculto para los estudiantes</div>}
                {m.attachments?.map((a) => (
                  <a key={a.url || a.name} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', color: 'inherit', textDecoration: 'underline', marginTop: 6 }}>
                    <Paperclip size={12} /> {a.name}
                  </a>
                ))}
                <div className="bubble-meta row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  {time(m.createdAt)}
                  {moderator && !mine && (
                    <button aria-label="Moderar" onClick={() => setActionsFor(m)} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }}><MoreVertical size={14} /></button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {mutedUntil ? (
        <div className="alert alert-warn"><VolumeX size={16} /> Un docente te silenció en este canal hasta las {time(mutedUntil)}.</div>
      ) : (
        <form className="composer" onSubmit={submit}>
          {session?.features?.fileUploads !== false && (
            <label className="icon-btn" aria-label="Adjuntar">
              <Paperclip size={20} />
              <input type="file" hidden accept="image/*,application/pdf" onChange={(e) => attach(e.target.files?.[0])} />
            </label>
          )}
          <textarea
            className="textarea"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Mensaje en ${first.channel.subject?.name ?? 'General'}…`}
            maxLength={2000}
          />
          <button className="btn" disabled={!text.trim() || send.isPending} aria-label="Enviar"><Send size={18} /></button>
        </form>
      )}

      {/* Acciones de moderación sobre un mensaje */}
      <Sheet open={!!actionsFor} onClose={() => setActionsFor(null)} title="Moderar mensaje">
        {actionsFor && (
          <div className="stack">
            <div className="card card-pad small" style={{ background: 'var(--surface-2)' }}>
              <b>{actionsFor.sender?.firstName} {actionsFor.sender?.lastName}:</b> {actionsFor.body}
            </div>
            {actionsFor.hidden ? (
              <button className="btn btn-ghost btn-block" onClick={() => moderate.mutate({ msg: actionsFor, action: 'unhide' })}><Eye size={16} /> Volver a mostrar</button>
            ) : (
              <button className="btn btn-block" onClick={() => moderate.mutate({ msg: actionsFor, action: 'hide' })}><EyeOff size={16} /> Ocultar mensaje</button>
            )}
            {!teachers.has(actionsFor.senderId) &&
              (mutedSet.has(actionsFor.senderId) ? (
                <button className="btn btn-ghost btn-block" onClick={() => unmute.mutate(actionsFor.senderId)}><Volume2 size={16} /> Levantar silencio (hasta {time(mutedSet.get(actionsFor.senderId)!)})</button>
              ) : (
                <button className="btn btn-ghost btn-block" onClick={() => (setMuteTarget({ id: actionsFor.senderId, name: `${actionsFor.sender?.firstName} ${actionsFor.sender?.lastName}` }), setActionsFor(null))}>
                  <VolumeX size={16} /> Silenciar a {actionsFor.sender?.firstName}
                </button>
              ))}
            <p className="xs muted">Lo oculto no se borra: queda registrado y vos lo seguís viendo.</p>
          </div>
        )}
      </Sheet>

      {muteTarget && <MuteSheet channelId={id} target={muteTarget} onClose={() => setMuteTarget(null)} onDone={() => qc.invalidateQueries({ queryKey: key })} />}
      {membersOpen && <MembersSheet channelId={id} moderator={!!moderator} mutes={mutedSet} onClose={() => setMembersOpen(false)} onProfile={setProfileId} onMute={(t) => (setMembersOpen(false), setMuteTarget(t))} />}
      <PersonSheet userId={profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}

const MuteSheet = ({ channelId, target, onClose, onDone }: { channelId: number; target: { id: number; name: string }; onClose: () => void; onDone: () => void }) => {
  const toast = useToast();
  const [hours, setHours] = useState(1);
  const [reason, setReason] = useState('');
  const mute = useMutation({
    mutationFn: () => apiSend('POST', `/school/channels/${channelId}/mute`, { userId: target.id, hours, reason: reason || null }),
    onSuccess: () => (toast(`${target.name} silenciado/a`), onDone(), onClose()),
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <Sheet open onClose={onClose} title={`Silenciar a ${target.name}`}>
      <div className="stack">
        <p className="small">No podrá escribir en este canal durante el tiempo elegido (sí puede leer).</p>
        <div className="chips">
          {[1, 3, 24, 72].map((h) => (
            <button key={h} type="button" className={`chip ${hours === h ? 'active' : ''}`} onClick={() => setHours(h)}>{h < 24 ? `${h} h` : `${h / 24} día${h > 24 ? 's' : ''}`}</button>
          ))}
        </div>
        <Field label="Motivo (opcional, queda registrado)"><input className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className="btn btn-accent btn-block" onClick={() => mute.mutate()} disabled={mute.isPending}><VolumeX size={16} /> Silenciar</button>
      </div>
    </Sheet>
  );
};

const MembersSheet = ({ channelId, moderator, mutes, onClose, onProfile, onMute }: {
  channelId: number; moderator: boolean; mutes: Map<number, string>; onClose: () => void; onProfile: (id: number) => void; onMute: (t: { id: number; name: string }) => void;
}) => {
  const q = useQuery({ queryKey: ['channel-members', channelId], queryFn: () => apiGet<Member[]>(`/school/channels/${channelId}/members`) });
  const sorted = [...(q.data ?? [])].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'DOCENTE' ? -1 : 1));
  return (
    <Sheet open onClose={onClose} title={`Integrantes${q.data ? ` (${q.data.length})` : ''}`}>
      {q.isLoading && <Skeleton count={5} h={52} />}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {sorted.map((m) => (
          <div key={m.id} className="list-item">
            <button className="row grow" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer', minWidth: 0 }} onClick={() => onProfile(m.id)}>
              <Avatar name={`${m.firstName} ${m.lastName}`} src={m.avatar} size="sm" />
              <span className="grow truncate">{m.lastName}, {m.firstName}</span>
              <Badge tone={m.kind === 'DOCENTE' ? 'accent' : undefined}>{m.kind === 'DOCENTE' ? 'Docente' : 'Estudiante'}</Badge>
              {mutes.has(m.id) && <Badge tone="warn">Silenciado</Badge>}
            </button>
            {moderator && m.kind === 'ESTUDIANTE' && !mutes.has(m.id) && (
              <button className="icon-btn" aria-label={`Silenciar a ${m.firstName}`} onClick={() => onMute({ id: m.id, name: `${m.firstName} ${m.lastName}` })}><VolumeX size={16} /></button>
            )}
          </div>
        ))}
      </div>
      <p className="xs muted" style={{ marginTop: 12 }}>Preceptoría y conducción también leen y moderan el canal.</p>
    </Sheet>
  );
};
