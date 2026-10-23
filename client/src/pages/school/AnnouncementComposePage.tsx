import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, X, Send, Save, Clock, FolderOpen } from 'lucide-react';
import { FilePicker } from '../../school/FilePicker';
import { apiGet, apiSend, uploadFile, formatBytes, type UploadedFile } from '../../lib/api';
import { Field, PageHeader, Skeleton, useToast, Chips, ErrorBox } from '../../ui';
import type { AudienceType, AttachmentRef } from '../../school/types';
import type { AnnouncementStatus } from './AnnouncementsPage';
import { FamilyPicker } from '../../school/FamilyPicker';

interface Audiences {
  schoolWide: boolean;
  levels: Array<{ id: number; name: string }>;
  divisions: Array<{ id: number; name: string; levelId: number; gradeYear?: number }>;
}

/** Borrador o programado que se está editando (GET /announcements/:id). */
interface Editable {
  id: number;
  title: string;
  body: string;
  audience: { type: AudienceType; ids: number[]; includeStaff?: boolean };
  requiresAck: boolean;
  priority: 'NORMAL' | 'URGENT';
  attachments: Array<AttachmentRef & { fileId?: number }>;
  status: AnnouncementStatus;
  scheduledAt: string | null;
  isAuthor: boolean;
}

type Mode = 'send' | 'draft' | 'schedule';

/** Fecha local "AAAA-MM-DDTHH:mm" para <input type="datetime-local">. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const defaultSchedule = () => {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d.toISOString());
};

/**
 * Redactar (o editar un borrador/programado). Tres salidas: enviar ahora, guardar como borrador
 * o programar el envío para una fecha y hora.
 */
export default function AnnouncementComposePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const editingId = Number(useParams().id) || null;
  const opts = useQuery({ queryKey: ['audiences'], queryFn: () => apiGet<Audiences>('/school/announcements/audiences') });
  const existing = useQuery({ queryKey: ['announcement', editingId], queryFn: () => apiGet<Editable>(`/school/announcements/${editingId}`), enabled: !!editingId });

  const [params] = useSearchParams();
  const presetDivision = Number(params.get('division')) || null;
  const [type, setType] = useState<AudienceType>('DIVISION');
  const [ids, setIds] = useState<number[]>(presetDivision ? [presetDivision] : []);
  const [includeStaff, setIncludeStaff] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [requiresAck, setRequiresAck] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [picking, setPicking] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [loaded, setLoaded] = useState(false);

  // Edición: se cargan los datos del borrador una sola vez.
  useEffect(() => {
    const a = existing.data;
    if (!a || loaded) return;
    setType(a.audience.type);
    setIds(a.audience.ids);
    setIncludeStaff(!!a.audience.includeStaff);
    setTitle(a.title);
    setBody(a.body);
    setRequiresAck(a.requiresAck);
    setUrgent(a.priority === 'URGENT');
    setFiles(a.attachments.filter((f) => f.fileId).map((f) => ({ fileId: f.fileId!, name: f.name, size: f.size ?? 0, mimeType: f.type ?? '' })));
    if (a.status === 'SCHEDULED' && a.scheduledAt) {
      setScheduling(true);
      setScheduledAt(toLocalInput(a.scheduledAt));
    }
    setLoaded(true);
  }, [existing.data, loaded]);

  const audienceTypes = useMemo(() => {
    const list: Array<{ value: AudienceType; label: string }> = [{ value: 'DIVISION', label: 'Divisiones' }];
    if (opts.data?.levels.length) list.push({ value: 'LEVEL', label: 'Nivel' });
    if (opts.data?.schoolWide) list.push({ value: 'SCHOOL', label: 'Toda la escuela' });
    // Familias elegidas una por una (listado completo con filtros por nivel, grado/año y división).
    list.push({ value: 'GUARDIANS', label: 'Familias (elegir)' });
    if (opts.data?.schoolWide) list.push({ value: 'STAFF', label: 'Solo personal' });
    return list;
  }, [opts.data]);

  const toggle = (id: number) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const payload = (mode: Mode) => ({
    title,
    body,
    audience: { type, ids: type === 'SCHOOL' || type === 'STAFF' ? [] : ids, includeStaff },
    requiresAck,
    priority: urgent ? 'URGENT' : 'NORMAL',
    attachments: files.map((f) => ({ fileId: f.fileId })),
    mode,
    ...(mode === 'schedule' ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
  });
  const save = useMutation({
    mutationFn: (mode: Mode) =>
      editingId
        ? apiSend<{ id: number; recipientCount: number; status: AnnouncementStatus }>('PUT', `/school/announcements/${editingId}`, payload(mode))
        : apiSend<{ id: number; recipientCount: number; status: AnnouncementStatus }>('POST', '/school/announcements', payload(mode)),
    onSuccess: (a, mode) => {
      toast(mode === 'send' ? `Comunicado enviado a ${a.recipientCount} destinatarios` : mode === 'draft' ? 'Borrador guardado' : 'Comunicado programado');
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcement', a.id] });
      navigate(`/comunicados/${a.id}`, { replace: true });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(list).slice(0, 10 - files.length)) {
        const up = await uploadFile(f, { purpose: 'ANNOUNCEMENT' });
        setFiles((prev) => [...prev, up]);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al subir', true);
    } finally {
      setUploading(false);
    }
  };

  const needsIds = type === 'DIVISION' || type === 'LEVEL' || type === 'GUARDIANS';
  const valid = title.trim().length >= 3 && body.trim() && (!needsIds || ids.length > 0);
  const scheduleValid = !scheduling || new Date(scheduledAt).getTime() > Date.now() + 60_000;
  const busy = save.isPending || uploading;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !scheduleValid) return;
    save.mutate(scheduling ? 'schedule' : 'send');
  };

  if (opts.isLoading || (editingId && existing.isLoading)) return <Skeleton count={4} h={70} />;
  if (editingId && existing.error) return <ErrorBox error={existing.error} />;
  if (editingId && existing.data && (!existing.data.isAuthor || (existing.data.status !== 'DRAFT' && existing.data.status !== 'SCHEDULED')))
    return <div className="alert alert-warn">Este comunicado ya fue enviado: no se puede editar.</div>;

  return (
    <form className="stack-lg page-narrow" style={{ margin: '0 auto', width: '100%' }} onSubmit={submit}>
      <PageHeader title={editingId ? 'Editar comunicado' : 'Nuevo comunicado'} subtitle="Llega al instante por la app, notificación push y, si hace falta, por email. También podés guardarlo como borrador o programarlo." />

      <section className="card card-pad stack">
        <h2 className="h3">¿Para quién?</h2>
        <Chips value={type} onChange={(v) => (setType(v), setIds([]))} items={audienceTypes} />
        {type === 'DIVISION' && (
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {opts.data?.divisions.map((d) => (
              <button type="button" key={d.id} className={`chip ${ids.includes(d.id) ? 'active' : ''}`} onClick={() => toggle(d.id)}>
                {d.name}
              </button>
            ))}
          </div>
        )}
        {type === 'LEVEL' && (
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {opts.data?.levels.map((l) => (
              <button type="button" key={l.id} className={`chip ${ids.includes(l.id) ? 'active' : ''}`} onClick={() => toggle(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
        )}
        {type === 'GUARDIANS' && opts.data && <FamilyPicker value={ids} onChange={setIds} levels={opts.data.levels} divisions={opts.data.divisions} />}
        {(type === 'DIVISION' || type === 'LEVEL') && (
          <label className="check">
            <input type="checkbox" checked={includeStaff} onChange={(e) => setIncludeStaff(e.target.checked)} /> Enviar copia a los docentes de esas divisiones
          </label>
        )}
      </section>

      <section className="card card-pad stack">
        <Field label="Título">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ej: Reunión de padres del 3º B" required />
        </Field>
        <Field label="Mensaje">
          <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={20000} placeholder="Escribí el comunicado…" required />
        </Field>

        <div className="stack" style={{ gap: 8 }}>
          {files.map((f) => (
            <div key={f.fileId} className="row card" style={{ padding: '8px 12px' }}>
              <Paperclip size={16} /> <span className="grow truncate small">{f.name}</span>
              <span className="xs muted">{formatBytes(f.size)}</span>
              <button type="button" className="icon-btn" onClick={() => setFiles((p) => p.filter((x) => x.fileId !== f.fileId))} aria-label="Quitar">
                <X size={16} />
              </button>
            </div>
          ))}
          <div className="row wrap" style={{ gap: 8 }}>
            <label className="btn btn-ghost btn-sm">
              <Paperclip size={16} /> {uploading ? 'Subiendo…' : 'Adjuntar archivo'}
              <input type="file" hidden multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={(e) => onFiles(e.target.files)} disabled={uploading} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(true)} disabled={files.length >= 10}><FolderOpen size={16} /> Elegir de mis archivos</button>
          </div>
          <FilePicker open={picking} onClose={() => setPicking(false)} max={10 - files.length} exclude={files.map((f) => f.fileId)} onPick={(picked) => setFiles((prev) => [...prev, ...picked.filter((p) => !prev.some((x) => x.fileId === p.fileId))])} />
        </div>

        <label className="check">
          <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} /> Pedir confirmación de lectura ("Notificado")
        </label>
        <label className="check">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Marcar como urgente (también se envía por email)
        </label>
      </section>

      <section className="card card-pad stack">
        <label className="check">
          <input type="checkbox" checked={scheduling} onChange={(e) => setScheduling(e.target.checked)} /> <Clock size={16} /> Programar el envío
        </label>
        {scheduling && (
          <Field label="Se envía el" hint="Sale solo a esa hora, aunque no estés conectado. Hasta entonces podés editarlo o cancelarlo.">
            <input type="datetime-local" className="input" value={scheduledAt} min={toLocalInput(new Date(Date.now() + 2 * 60_000).toISOString())} onChange={(e) => setScheduledAt(e.target.value)} style={{ maxWidth: 260 }} />
            {!scheduleValid && <p className="field-error">La fecha tiene que ser futura.</p>}
          </Field>
        )}
      </section>

      <div className="stack" style={{ gap: 8 }}>
        <button className="btn btn-accent btn-block" disabled={!valid || !scheduleValid || busy}>
          {scheduling ? <Clock size={18} /> : <Send size={18} />} {save.isPending ? 'Guardando…' : scheduling ? 'Programar envío' : 'Enviar comunicado'}
        </button>
        <button type="button" className="btn btn-ghost btn-block" disabled={!valid || busy} onClick={() => save.mutate('draft')}>
          <Save size={18} /> Guardar como borrador
        </button>
      </div>
    </form>
  );
}
