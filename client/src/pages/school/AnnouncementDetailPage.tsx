import { useState, type FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, Paperclip, Send, AlertTriangle, Pencil, Trash2, Archive, ArchiveRestore, Clock, MessageCircle, Reply, X, ChevronRight } from 'lucide-react';
import { StatusBadge, type AnnouncementStatus } from './AnnouncementsPage';
import { apiGet, apiSend, uploadFile, formatBytes, type UploadedFile } from '../../lib/api';
import { Avatar, Badge, Card, ErrorBox, Skeleton, Tabs, fmtDate, fullName, useToast, timeAgo } from '../../ui';
import { AUDIENCE_TARGET_LABELS, type AnnouncementCategory, type AttachmentRef, type AudienceTarget, type AudienceType, type PersonLite } from '../../school/types';
import { useSchool } from '../../school/SchoolContext';
import { uploadLimitLabel } from '../../school/plans';
import { CategoryBadge } from '../../school/announcements';
import { Entity, Action } from '../../school/permissions';

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
  audience?: { type: AudienceType; target?: AudienceTarget };
  category?: AnnouncementCategory;
  allowReplies?: boolean;
  /** Soy destinatario, admite respuestas, está enviado y no lo escribí yo. */
  canReply?: boolean;
  /** Mi conversación privada con quien lo envió (si ya respondí). */
  myThreadId?: number | null;
  /** Solo para el autor: las respuestas son privadas de quien envió. */
  replies?: Replies | null;
}

interface Replies {
  total: number;
  unread: number;
  items: Array<{ threadId: number; user: { id: number; firstName: string; lastName: string; avatar: string | null }; roleLabel: string; lastMessageAt: string; lastMessagePreview: string; unread: number }>;
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

const RecipientsPanel = ({ id, requiresAck, canRemind }: { id: number; requiresAck: boolean; canRemind: boolean }) => {
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
        {canRemind && (
          <button className="btn btn-sm btn-ghost" onClick={() => remind.mutate()} disabled={remind.isPending}>
            <Send size={14} /> Recordar a pendientes
          </button>
        )}
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

/** Responder: abre (o continúa) un chat privado con quien lo envió. Nadie más del público lo ve. */
const ReplyBox = ({ a }: { a: Detail }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSchool();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const reply = useMutation({
    mutationFn: () => apiSend<{ threadId: number }>('POST', `/school/announcements/${a.id}/reply`, { body: text.trim(), attachments: files.map((f) => ({ fileId: f.fileId })) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['announcement', a.id] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['threads'] });
      navigate(`/mensajes/${r.threadId}`);
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const attach = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(list).slice(0, 5 - files.length)) {
        const up = await uploadFile(f, { purpose: 'MESSAGE' });
        setFiles((p) => [...p, up]);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al subir', true);
    } finally {
      setUploading(false);
    }
  };
  const author = fullName(a.Author);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() && !reply.isPending) reply.mutate();
  };
  return (
    <Card>
      <form className="stack" onSubmit={submit}>
        <label htmlFor="reply-text" className="h3 row" style={{ gap: 6 }}><Reply size={18} /> Responderle a {author}</label>
        <textarea id="reply-text" className="textarea" rows={3} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribí tu respuesta…" />
        {files.map((f) => (
          <div key={f.fileId} className="row card" style={{ padding: '6px 12px' }}>
            <Paperclip size={14} /> <span className="grow truncate small">{f.name}</span>
            <span className="xs muted">{formatBytes(f.size)}</span>
            <button type="button" className="icon-btn" onClick={() => setFiles((p) => p.filter((x) => x.fileId !== f.fileId))} aria-label={`Quitar ${f.name}`}><X size={14} /></button>
          </div>
        ))}
        <div className="row wrap" style={{ gap: 8 }}>
          {session?.features?.fileUploads !== false && files.length < 5 && (
            <label className="btn btn-ghost btn-sm" title={`Máximo ${uploadLimitLabel(session?.features?.maxUploadMb)} por archivo`}>
              <Paperclip size={16} /> {uploading ? 'Subiendo…' : 'Adjuntar'}
              <input type="file" hidden multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => attach(e.target.files)} disabled={uploading} />
            </label>
          )}
          <span className="grow" />
          <button className="btn btn-accent btn-sm" disabled={!text.trim() || reply.isPending || uploading}><Send size={14} /> {reply.isPending ? 'Enviando…' : 'Responder'}</button>
        </div>
        <span className="xs muted">Tu respuesta le llega solo a {author}, en una conversación privada.</span>
      </form>
    </Card>
  );
};

/** Autor: quién respondió. Cada respuesta es un chat privado; acá solo el resumen. */
const RepliesPanel = ({ replies }: { replies: Replies }) => (
  <section className="stack" aria-labelledby="replies-h">
    <div className="row-between">
      <h2 className="h2" id="replies-h">Respuestas</h2>
      <span className="small muted">{replies.total} {replies.total === 1 ? 'conversación' : 'conversaciones'}{replies.unread > 0 && ` · ${replies.unread} sin leer`}</span>
    </div>
    {replies.items.length ? (
      <div className="card list" style={{ overflow: 'hidden' }}>
        {replies.items.map((r) => {
          const name = `${r.user.firstName} ${r.user.lastName}`;
          return (
            <Link key={r.threadId} to={`/mensajes/${r.threadId}`} className={`list-item ${r.unread ? 'unread' : ''}`}>
              <Avatar name={name} src={r.user.avatar} size="sm" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row-between">
                  <span className="h3 truncate">{r.unread > 0 && <span className="dot" style={{ marginRight: 6 }} />}{name}</span>
                  <span className="xs muted" style={{ flexShrink: 0 }}>{timeAgo(r.lastMessageAt)}</span>
                </div>
                <div className="xs muted truncate">{r.roleLabel}</div>
                <div className="small truncate" style={{ fontWeight: r.unread ? 700 : 400 }}>{r.lastMessagePreview}</div>
              </div>
              {r.unread > 0 ? <span className="count" aria-label={`${r.unread} sin leer`}>{r.unread}</span> : <ChevronRight size={16} className="muted" />}
            </Link>
          );
        })}
      </div>
    ) : (
      <div className="card card-pad small muted">Todavía nadie respondió. Cada respuesta te llega como una conversación privada.</div>
    )}
  </section>
);

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
  const { can } = useSchool();
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
  // Recordar/archivar exigen announcements:create: una familia que mandó un comunicado personal solo ve las estadísticas.
  const staffManage = can(Entity.ANNOUNCEMENTS, Action.CREATE);
  // El destino (familias/estudiantes) ya suele venir en audienceLabel; se muestra aparte solo si no está.
  const targetLabel = a?.audience?.target && a.audience.target !== 'FAMILIES' ? AUDIENCE_TARGET_LABELS[a.audience.target] : null;
  const target = a && targetLabel && !a.audienceLabel.toLowerCase().includes(targetLabel.toLowerCase()) ? targetLabel : null;
  return (
    <div className="stack-lg page-narrow" style={{ margin: '0 auto', width: '100%' }}>
      <Link to={a?.isAuthor ? '/comunicados?tab=enviados' : '/comunicados'} className="row small muted no-print"><ArrowLeft size={16} /> Comunicados</Link>
      {q.error && <ErrorBox error={q.error} />}
      {q.isLoading && <Skeleton count={2} h={120} />}
      {a && (
        <>
          {a.canManage && staffManage && <div className="no-print"><ManageBar a={a} /></div>}
          <article className="card card-pad stack">
            <div className="row wrap" style={{ gap: 6 }}>
              <CategoryBadge category={a.category} />
              {a.status !== 'SENT' && <StatusBadge status={a.status} scheduledAt={a.scheduledAt} />}
              {a.priority === 'URGENT' && <Badge tone="danger"><AlertTriangle size={12} /> Urgente</Badge>}
              <span className="badge" style={{ whiteSpace: 'normal' }}>Para: {a.audienceLabel}</span>
              {target && <Badge tone="info">Llega a: {target}</Badge>}
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

          {a.myThreadId ? (
            <Link to={`/mensajes/${a.myThreadId}`} className="card card-pad row card-link no-print" style={{ gap: 10 }}>
              <MessageCircle size={20} className="accent" />
              <span className="grow">
                <b>Ver conversación</b>
                <span className="xs muted" style={{ display: 'block' }}>Ya le respondiste a {fullName(a.Author)}. Seguí la charla ahí.</span>
              </span>
              <ChevronRight size={16} className="muted" />
            </Link>
          ) : (
            a.canReply && <div className="no-print"><ReplyBox a={a} /></div>
          )}

          {a.isAuthor && a.status !== 'DRAFT' && a.status !== 'SCHEDULED' && (
            // La API siempre manda `replies` al autor (vacío si no admite respuestas): el panel solo si se puede responder o ya hubo.
            a.replies && (a.allowReplies || a.replies.total > 0) ? <RepliesPanel replies={a.replies} /> : a.allowReplies === false && <p className="small muted" style={{ textAlign: 'center' }}>Este comunicado no admite respuestas.</p>
          )}

          {a.stats && (
            <>
              <div className="grid grid-2">
                <Card><div className="stat" style={{ padding: 0 }}><div className="value">{a.stats.read}/{a.stats.total}</div><div className="label">Leyeron</div></div></Card>
                {a.requiresAck && <Card><div className="stat" style={{ padding: 0 }}><div className="value">{a.stats.ack}/{a.stats.total}</div><div className="label">Confirmaron</div></div></Card>}
              </div>
              <RecipientsPanel id={a.id} requiresAck={a.requiresAck} canRemind={staffManage} />
            </>
          )}
        </>
      )}
    </div>
  );
}
