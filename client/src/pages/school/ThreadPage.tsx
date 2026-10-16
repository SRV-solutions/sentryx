import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { ArrowLeft, Send, UserPlus, Paperclip, Lock } from 'lucide-react';
import { apiGet, apiSend, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/SocketContext';
import { useSchool } from '../../school/SchoolContext';
import { ErrorBox, Sheet, Skeleton, useToast, fmtDate, Avatar } from '../../ui';
import type { AttachmentRef } from '../../school/types';

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
  const { can } = useSchool();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [deriveOpen, setDeriveOpen] = useState(false);
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
  const closed = !!first.thread.closedAt;
  let lastDay = '';

  return (
    <div className="page-narrow" style={{ margin: '0 auto', width: '100%' }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <Link to="/mensajes" className="icon-btn" aria-label="Volver"><ArrowLeft size={20} /></Link>
        <Avatar name={others[0] ? `${others[0].firstName} ${others[0].lastName}` : '?'} src={others[0]?.avatar} size="sm" />
        <div className="grow">
          <div className="h3 truncate">{first.thread.subject}</div>
          <div className="xs muted truncate">
            {others.map((o) => `${o.firstName} ${o.lastName} (${o.roleLabel})`).join(', ')}
            {first.thread.student && ` · ${first.thread.student.firstName} ${first.thread.student.lastName}`}
          </div>
        </div>
        {can('messages.staff') && (
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
          <label className="icon-btn" aria-label="Adjuntar">
            <Paperclip size={20} />
            <input type="file" hidden accept="image/*,application/pdf" onChange={(e) => attach(e.target.files?.[0])} />
          </label>
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
