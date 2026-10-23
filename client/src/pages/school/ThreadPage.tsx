import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { ArrowLeft, Send, UserPlus, Paperclip, Lock, Users, ChevronRight, CheckCheck } from 'lucide-react';
import { apiGet, apiSend, uploadFile } from '../../lib/api';
import { FolderOpen } from 'lucide-react';
import { FilePicker } from '../../school/FilePicker';
import { uploadLimitLabel } from '../../school/plans';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/SocketContext';
import { useSchool } from '../../school/SchoolContext';
import { ErrorBox, Sheet, Skeleton, useToast, fmtDate, Avatar, timeAgo } from '../../ui';
import { PersonSheet } from '../../school/PersonProfile';
import type { AttachmentRef } from '../../school/types';
import { Entity, Action } from '../../school/permissions';

interface Message { id: number; senderId: number; body: string; attachments: AttachmentRef[]; createdAt: string }
interface ThreadData {
  thread: { id: number; subject: string; closedAt: string | null; student: { id: number; firstName: string; lastName: string } | null };
  participants: Array<{ id: number; firstName: string; lastName: string; avatar: string | null; roleLabel: string; lastReadAt: string | null }>;
  messages: Message[];
  hasMore: boolean;
}

const time = (d: string) => new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

export default function ThreadPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const me = user?.userData.id ?? 0;
  const { can, session } = useSchool();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [deriveOpen, setDeriveOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const key = ['thread', id];

  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => apiGet<ThreadData>(`/school/threads/${id}${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.id : undefined),
  });

  useEffect(() => {
    if (q.isSuccess) {
      qc.invalidateQueries({ queryKey: ['badge', 'threads'] });
      qc.invalidateQueries({ queryKey: ['threads'] });
    }
  }, [q.isSuccess, qc]);

  const first = q.data?.pages[0];
  const messages = q.data ? [...q.data.pages].reverse().flatMap((p) => p.messages) : [];

  // Mensajes nuevos en tiempo real: se agregan sin recargar.
  const onMessage = useCallback(
    (p: { threadId: number; message: Message }) => {
      if (p.threadId !== id) return;
      qc.setQueryData<InfiniteData<ThreadData>>(key, (old) => {
        if (!old || old.pages[0].messages.some((m) => m.id === p.message.id)) return old;
        const [head, ...rest] = old.pages;
        return { ...old, pages: [{ ...head, messages: [...head.messages, p.message] }, ...rest] };
      });
      if (p.message.senderId !== me) apiSend('POST', `/school/threads/${id}/read`).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, me, qc]
  );
  useSocketEvent('thread_message', onMessage);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (payload: { body: string; attachments?: object[] }) => apiSend<Message>('POST', `/school/threads/${id}/messages`, payload),
    onSuccess: (m) => onMessage({ threadId: id, message: m }),
    onError: (e: Error) => toast(e.message, true),
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    send.mutate({ body });
  };

  const [picking, setPicking] = useState(false);
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
  if (!first) return <Skeleton count={5} h={50} />;
  const others = first.participants.filter((p) => p.id !== me);
  const isGroup = others.length > 1;
  const byId = new Map(first.participants.map((p) => [p.id, p]));
  const closed = !!first.thread.closedAt;
  // 1 a 1: tocar el encabezado abre el perfil del otro. Grupal: la lista de integrantes.
  const openHeader = () => (isGroup ? setMembersOpen(true) : others[0] && setProfileId(others[0].id));
  let lastDay = '';

  return (
    <div className="page-narrow" style={{ margin: '0 auto', width: '100%' }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <Link to="/mensajes" className="icon-btn" aria-label="Volver"><ArrowLeft size={20} /></Link>
        <button
          className="row grow"
          style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer', minWidth: 0, gap: 10 }}
          onClick={openHeader}
          aria-label={isGroup ? 'Ver integrantes de la conversación' : 'Ver perfil'}
        >
          {isGroup ? (
            <span style={{ position: 'relative', width: 40, height: 32, flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: 0, top: 0 }}><Avatar name={`${others[0].firstName} ${others[0].lastName}`} src={others[0].avatar} size="sm" /></span>
              <span style={{ position: 'absolute', left: 12, top: 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--bg)' }}><Avatar name={`${others[1].firstName} ${others[1].lastName}`} src={others[1].avatar} size="sm" /></span>
            </span>
          ) : (
            <Avatar name={others[0] ? `${others[0].firstName} ${others[0].lastName}` : '?'} src={others[0]?.avatar} size="sm" />
          )}
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="h3 truncate" style={{ display: 'block' }}>{first.thread.subject}</span>
            <span className="xs muted truncate" style={{ display: 'block' }}>
              {isGroup ? `${first.participants.length} integrantes · ` : ''}
              {others.map((o) => (isGroup ? o.firstName : `${o.firstName} ${o.lastName} (${o.roleLabel})`)).join(', ')}
              {first.thread.student && ` · ${first.thread.student.firstName} ${first.thread.student.lastName}`}
            </span>
          </span>
          <ChevronRight size={16} className="muted" style={{ flexShrink: 0 }} />
        </button>
        {can(Entity.MESSAGES, Action.MANAGE) && (
          <button className="icon-btn" onClick={() => setDeriveOpen(true)} aria-label="Sumar a un colega"><UserPlus size={20} /></button>
        )}
      </div>

      {q.hasNextPage && (
        <button className="btn btn-sm btn-ghost btn-block" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          Ver mensajes anteriores
        </button>
      )}

      <div className="chat">
        {messages.map((m) => {
          const day = fmtDate(m.createdAt, { weekday: 'long', day: 'numeric', month: 'long' });
          const showDay = day !== lastDay;
          lastDay = day;
          const system = m.body.startsWith('ℹ️');
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showDay && <div className="bubble bubble-system">{day}</div>}
              <div className={`bubble ${system ? 'bubble-system' : m.senderId === me ? 'bubble-me' : 'bubble-other'}`}>
                {isGroup && !system && m.senderId !== me && byId.get(m.senderId) && (
                  <button
                    className="xs"
                    style={{ display: 'block', background: 'none', border: 0, padding: 0, marginBottom: 2, fontWeight: 800, color: 'var(--primary)', cursor: 'pointer' }}
                    onClick={() => setProfileId(m.senderId)}
                  >
                    {byId.get(m.senderId)!.firstName} {byId.get(m.senderId)!.lastName} · {byId.get(m.senderId)!.roleLabel}
                  </button>
                )}
                {m.body}
                {m.attachments?.map((a) => (
                  <a key={a.url} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', color: 'inherit', textDecoration: 'underline', marginTop: 6 }}>
                    <Paperclip size={12} /> {a.name}
                  </a>
                ))}
                {!system && <div className="bubble-meta">{time(m.createdAt)}</div>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {closed ? (
        <div className="alert alert-info"><Lock size={16} /> La institución cerró esta conversación.</div>
      ) : (
        <form className="composer" onSubmit={submit}>
          {session?.features?.fileUploads !== false && (
            <>
              <label className="icon-btn" aria-label="Adjuntar" title={`Adjuntar foto o PDF (máximo ${uploadLimitLabel(session?.features?.maxUploadMb)})`}>
                <Paperclip size={20} />
                <input type="file" hidden accept="image/*,application/pdf" onChange={(e) => attach(e.target.files?.[0])} />
              </label>
              <button type="button" className="icon-btn" aria-label="Compartir uno de mis archivos" title="Compartir uno de mis archivos" onClick={() => setPicking(true)}><FolderOpen size={20} /></button>
              <FilePicker open={picking} onClose={() => setPicking(false)} max={1} onPick={(picked) => picked[0] && send.mutate({ body: `📎 ${picked[0].name}`, attachments: [{ fileId: picked[0].fileId }] })} />
            </>
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
            placeholder="Escribí un mensaje…"
            maxLength={5000}
          />
          <button className="btn" disabled={!text.trim() || send.isPending} aria-label="Enviar"><Send size={18} /></button>
        </form>
      )}

      {deriveOpen && <DeriveSheet threadId={id} onClose={() => setDeriveOpen(false)} />}

      <Sheet open={membersOpen} onClose={() => setMembersOpen(false)} title={`Integrantes (${first.participants.length})`}>
        <div className="stack">
          <div className="card list" style={{ overflow: 'hidden' }}>
            {first.participants.map((p) => (
              <button key={p.id} className="list-item list-button" onClick={() => setProfileId(p.id)}>
                <Avatar name={`${p.firstName} ${p.lastName}`} src={p.avatar} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="h3 truncate" style={{ display: 'block' }}>{p.firstName} {p.lastName}{p.id === me ? ' (vos)' : ''}</span>
                  <span className="xs muted truncate" style={{ display: 'block' }}>{p.roleLabel}</span>
                  {p.id !== me && (
                    <span className="xs muted row" style={{ gap: 4 }}>
                      <CheckCheck size={12} /> {p.lastReadAt ? `Leyó ${timeAgo(p.lastReadAt)}` : 'Todavía no abrió la conversación'}
                    </span>
                  )}
                </span>
                <ChevronRight size={16} className="muted" />
              </button>
            ))}
          </div>
          {can(Entity.MESSAGES, Action.MANAGE) && !closed && (
            <button className="btn btn-ghost btn-block" onClick={() => (setMembersOpen(false), setDeriveOpen(true))}><Users size={16} /> Sumar a un colega</button>
          )}
        </div>
      </Sheet>
      <PersonSheet userId={profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}

/** Derivar la conversación a un colega (ej: docente → dirección). */
const DeriveSheet = ({ threadId, onClose }: { threadId: number; onClose: () => void }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiGet<Array<{ id: number; userId: number; roleLabel: string; User: { id: number; firstName: string; lastName: string } }>>('/school/staff'),
  });
  const add = useMutation({
    mutationFn: (userId: number) => apiSend('POST', `/school/threads/${threadId}/participants`, { userId }),
    onSuccess: () => {
      toast('Colega sumado a la conversación');
      qc.invalidateQueries({ queryKey: ['thread', threadId] });
      onClose();
    },
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <Sheet open onClose={onClose} title="Sumar a un colega">
      {staff.isLoading && <Skeleton count={4} h={48} />}
      {staff.error && <ErrorBox error={staff.error} />}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {staff.data?.map((m) => (
          <button key={m.id} className="list-item" style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick={() => add.mutate(m.userId)}>
            <Avatar name={`${m.User.firstName} ${m.User.lastName}`} size="sm" />
            <span className="grow">{m.User.firstName} {m.User.lastName}</span>
            <span className="badge">{m.roleLabel}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
};
