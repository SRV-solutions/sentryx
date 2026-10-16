import { FormEvent, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, X, Send } from 'lucide-react';
import { apiGet, apiSend, uploadFile, formatBytes, type UploadedFile } from '../../lib/api';
import { Field, PageHeader, Skeleton, useToast, Chips } from '../../ui';
import type { AudienceType } from '../../school/types';

interface Audiences {
  schoolWide: boolean;
  levels: Array<{ id: number; name: string }>;
  divisions: Array<{ id: number; name: string; levelId: number }>;
}


export default function AnnouncementComposePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const opts = useQuery({ queryKey: ['audiences'], queryFn: () => apiGet<Audiences>('/school/announcements/audiences') });

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

  const audienceTypes = useMemo(() => {
    const list: Array<{ value: AudienceType; label: string }> = [{ value: 'DIVISION', label: 'Divisiones' }];
    if (opts.data?.levels.length) list.push({ value: 'LEVEL', label: 'Nivel' });
    if (opts.data?.schoolWide) list.push({ value: 'SCHOOL', label: 'Toda la escuela' }, { value: 'STAFF', label: 'Solo personal' });
    return list;
  }, [opts.data]);

  const toggle = (id: number) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = useMutation({
    mutationFn: () =>
      apiSend<{ id: number; recipientCount: number }>('POST', '/school/announcements', {
        title,
        body,
        audience: { type, ids: type === 'SCHOOL' || type === 'STAFF' ? [] : ids, includeStaff },
        requiresAck,
        priority: urgent ? 'URGENT' : 'NORMAL',
        attachments: files.map((f) => ({ fileId: f.fileId })),
      }),
    onSuccess: (a) => {
      toast(`Comunicado enviado a ${a.recipientCount} destinatarios`);
      qc.invalidateQueries({ queryKey: ['announcements'] });
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

  const needsIds = type === 'DIVISION' || type === 'LEVEL';
  const valid = title.trim().length >= 3 && body.trim() && (!needsIds || ids.length > 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) send.mutate();
  };

  if (opts.isLoading) return <Skeleton count={4} h={70} />;

  return (
    <form className="stack-lg page-narrow" style={{ margin: '0 auto', width: '100%' }} onSubmit={submit}>
      <PageHeader title="Nuevo comunicado" subtitle="Llega al instante por la app, notificación push y, si hace falta, por email." />

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
          <label className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
            <Paperclip size={16} /> {uploading ? 'Subiendo…' : 'Adjuntar archivo'}
            <input type="file" hidden multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={(e) => onFiles(e.target.files)} disabled={uploading} />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} /> Pedir confirmación de lectura ("Notificado")
        </label>
        <label className="check">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Marcar como urgente (también se envía por email)
        </label>
      </section>

      <button className="btn btn-accent btn-block" disabled={!valid || send.isPending || uploading}>
        <Send size={18} /> {send.isPending ? 'Enviando…' : 'Enviar comunicado'}
      </button>
    </form>
  );
}
