import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, Paperclip, Send, AlertTriangle, Pencil, Trash2, Archive, ArchiveRestore, Clock } from 'lucide-react';
import { StatusBadge, type AnnouncementStatus } from './AnnouncementsPage';
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
  status: AnnouncementStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  /** Autor o quien ve las estadísticas: puede archivar. */
  canManage: boolean;
  isAuthor: boolean;
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

/** Acciones del autor sobre borradores/programados y archivado de enviados. */
const ManageBar = ({ a }: { a: Detail }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['announcement', a.id] });
    qc.invalidateQueries({ queryKey: ['announcements'] });
  };
  const act = useMutation({
    mutationFn: (action: 'send' | 'archive' | 'unarchive' | 'delete') =>
      action === 'delete' ? apiSend('DELETE', `/school/announcements/${a.id}`) : apiSend('POST', `/school/announcements/${a.id}/${action}`),
    onSuccess: (_r, action) => {
      toast(action === 'send' ? 'Comunicado enviado' : action === 'archive' ? 'Comunicado archivado' : action === 'unarchive' ? 'Comunicado restaurado' : 'Borrador eliminado');
      if (action === 'delete') {
        qc.invalidateQueries({ queryKey: ['announcements'] });
        navigate('/comunicados', { replace: true });
      } else refresh();
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const pending = a.status === 'DRAFT' || a.status === 'SCHEDULED';
  if (pending && !a.isAuthor) return null;
  return (
    <Card>
      <div className="stack">
        <div className="row wrap" style={{ gap: 8 }}>
          <StatusBadge status={a.status} scheduledAt={a.scheduledAt} />
          <span className="small muted">
            {a.status === 'DRAFT' && `Todavía no se envió. Llegaría a ${a.recipientCount} destinatarios.`}
            {a.status === 'SCHEDULED' && a.scheduledAt && `Se envía solo el ${fmtDate(a.scheduledAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} a ${a.recipientCount} destinatarios.`}
            {a.status === 'ARCHIVED' && 'Ya no aparece en la bandeja de las familias (sigue accesible con el filtro "Archivados").'}
            {a.status === 'SENT' && a.sentAt && `Enviado el ${fmtDate(a.sentAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`}
          </span>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {pending && (
            <>
              <button className="btn btn-sm btn-accent" onClick={() => confirm(`¿Enviar ahora a ${a.recipientCount} destinatarios?`) && act.mutate('send')} disabled={act.isPending}><Send size={14} /> Enviar ahora</button>
              <Link to={`/comunicados/${a.id}/editar`} className="btn btn-sm btn-ghost"><Pencil size={14} /> Editar</Link>
              <button className="btn btn-sm btn-ghost" onClick={() => confirm('¿Eliminar este borrador? No se puede deshacer.') && act.mutate('delete')} disabled={act.isPending}><Trash2 size={14} /> Eliminar</button>
            </>
          )}
          {a.status === 'SENT' && <button className="btn btn-sm btn-ghost" onClick={() => act.mutate('archive')} disabled={act.isPending}><Archive size={14} /> Archivar</button>}
          {a.status === 'ARCHIVED' && <button className="btn btn-sm btn-ghost" onClick={() => act.mutate('unarchive')} disabled={act.isPending}><ArchiveRestore size={14} /> Restaurar</button>}
        </div>
      </div>
    </Card>
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
          {a.canManage && <div className="no-print"><ManageBar a={a} /></div>}
          <article className="card card-pad stack">
            <div className="row wrap" style={{ gap: 6 }}>
              {a.status !== 'SENT' && <StatusBadge status={a.status} scheduledAt={a.scheduledAt} />}
              {a.priority === 'URGENT' && <Badge tone="danger"><AlertTriangle size={12} /> Urgente</Badge>}
              <Badge>Para: {a.audienceLabel}</Badge>
            </div>
            <h1 className="h1">{a.title}</h1>
            <div className="row">
              <Avatar name={fullName(a.Author)} src={a.Author?.avatar} size="sm" />
              <div className="small">
                <b>{fullName(a.Author)}</b>
                <div className="xs muted">{a.status === 'SCHEDULED' ? <><Clock size={12} /> programado</> : fmtDate(a.sentAt ?? a.createdAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
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
