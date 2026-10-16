import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, Paperclip, Send, AlertTriangle } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { Avatar, Badge, Card, ErrorBox, Skeleton, Tabs, fmtDate, fullName, useToast, timeAgo } from '../../ui';
import type { AttachmentRef, PersonLite } from '../../school/types';

interface Detail {
  id: number;
  title: string;
  body: string;
  audienceLabel: string;
  requiresAck: boolean;
  priority: 'NORMAL' | 'URGENT';
  createdAt: string;
  Author: PersonLite;
  attachments: AttachmentRef[];
  myReceipt: { readAt: string | null; ackAt: string | null } | null;
  stats: { total: number; read: number; ack: number } | null;
}

interface Recipient {
  user: PersonLite;
  students: string[];
  readAt: string | null;
  ackAt: string | null;
}

/** Convierte URLs del texto en enlaces (sin HTML: el contenido se muestra siempre como texto). */
const Linkified = ({ text }: { text: string }) => (
  <>
    {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noreferrer noopener">
          {part}
        </a>
      ) : (
        part
      )
    )}
  </>
);

const RecipientsPanel = ({ id, requiresAck }: { id: number; requiresAck: boolean }) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'pending-ack'>('all');
  const toast = useToast();
  const q = useQuery({ queryKey: ['announcement-recipients', id, filter], queryFn: () => apiGet<Recipient[]>(`/school/announcements/${id}/recipients?filter=${filter}`) });
  const remind = useMutation({
    mutationFn: () => apiSend<{ reminded: number }>('POST', `/school/announcements/${id}/remind`),
    onSuccess: (r) => toast(`Recordatorio enviado a ${r.reminded} personas`),
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <section className="stack">
      <div className="row-between">
        <h2 className="h2">Destinatarios</h2>
        <button className="btn btn-sm btn-ghost" onClick={() => remind.mutate()} disabled={remind.isPending}>
          <Send size={14} /> Recordar a pendientes
        </button>
      </div>
      <Tabs
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'all', label: 'Todos' },
          { value: 'unread', label: 'Sin leer' },
          ...(requiresAck ? [{ value: 'pending-ack' as const, label: 'Sin confirmar' }] : []),
        ]}
      />
      {q.isLoading ? (
        <Skeleton count={4} h={56} />
      ) : (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {q.data?.map((r) => (
            <div key={r.user.id} className="list-item">
              <Avatar name={fullName(r.user)} size="sm" />
              <div className="grow">
                <div className="h3 truncate">{fullName(r.user)}</div>
                {r.students.length > 0 && <div className="xs muted truncate">{r.students.join(' · ')}</div>}
              </div>
              {r.ackAt ? <Badge tone="ok">Confirmó</Badge> : r.readAt ? <Badge tone="info">Leído {timeAgo(r.readAt)}</Badge> : <Badge>Sin leer</Badge>}
            </div>
          ))}
          {!q.data?.length && <div className="list-item muted small">Nadie en esta lista 🎉</div>}
        </div>
      )}
    </section>
  );
};

export default function AnnouncementDetailPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['announcement', id],
    queryFn: async () => {
      const d = await apiGet<Detail>(`/school/announcements/${id}`);
      // Abrirlo lo marca como leído: refrescamos contadores.
      qc.invalidateQueries({ queryKey: ['badge', 'announcements'] });
      qc.invalidateQueries({ queryKey: ['announcements', 'inbox'] });
      return d;
    },
  });
  const ack = useMutation({
    mutationFn: () => apiSend('POST', `/school/announcements/${id}/ack`),
    onSuccess: () => {
      toast('¡Gracias! Confirmaste la lectura ✅');
      qc.invalidateQueries({ queryKey: ['announcement', id] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const a = q.data;
  return (
    <div className="stack-lg page-narrow" style={{ margin: '0 auto', width: '100%' }}>
      <Link to="/comunicados" className="row small muted no-print"><ArrowLeft size={16} /> Comunicados</Link>
      {q.error && <ErrorBox error={q.error} />}
      {q.isLoading && <Skeleton count={2} h={120} />}
      {a && (
        <>
          <article className="card card-pad stack">
            <div className="row wrap" style={{ gap: 6 }}>
              {a.priority === 'URGENT' && <Badge tone="danger"><AlertTriangle size={12} /> Urgente</Badge>}
              <Badge>Para: {a.audienceLabel}</Badge>
            </div>
            <h1 className="h1">{a.title}</h1>
            <div className="row">
              <Avatar name={fullName(a.Author)} src={a.Author?.avatar} size="sm" />
              <div className="small">
                <b>{fullName(a.Author)}</b>
                <div className="xs muted">{fmtDate(a.createdAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.6 }}>
              <Linkified text={a.body} />
            </div>
            {a.attachments.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                {a.attachments.map((f) => (
                  <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="card card-pad row" style={{ padding: 12 }}>
                    <Paperclip size={18} /> <span className="grow truncate">{f.name}</span>
                    {f.size && <span className="xs muted">{Math.ceil(f.size / 1024)} KB</span>}
                  </a>
                ))}
              </div>
            )}
          </article>

          {a.myReceipt && a.requiresAck && (
            <Card>
              {a.myReceipt.ackAt ? (
                <div className="row" style={{ color: 'var(--ok)' }}>
                  <CheckCheck size={20} /> <b>Confirmaste la lectura el {fmtDate(a.myReceipt.ackAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</b>
                </div>
              ) : (
                <div className="stack">
                  <p className="small">La institución necesita que confirmes que leíste este comunicado.</p>
                  <button className="btn btn-accent btn-block" onClick={() => ack.mutate()} disabled={ack.isPending}>
                    <CheckCheck size={18} /> Confirmo que lo leí
                  </button>
                </div>
              )}
            </Card>
          )}

          {a.stats && (
            <>
              <div className="grid grid-2">
                <Card><div className="stat" style={{ padding: 0 }}><div className="value">{a.stats.read}/{a.stats.total}</div><div className="label">Leyeron</div></div></Card>
                {a.requiresAck && <Card><div className="stat" style={{ padding: 0 }}><div className="value">{a.stats.ack}/{a.stats.total}</div><div className="label">Confirmaron</div></div></Card>}
              </div>
              <RecipientsPanel id={a.id} requiresAck={a.requiresAck} />
            </>
          )}
        </>
      )}
    </div>
  );
}
