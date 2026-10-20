/** "Reportar un problema": va asociado al usuario logueado, con la pantalla y los últimos errores del navegador. */
import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, X, Film, Image as ImageIcon } from 'lucide-react';
import { apiGet, apiSend, compressImage, formatBytes, ApiError } from '../lib/api';
import { recentClientErrors } from '../lib/clientErrors';
import { Badge, Empty, Field, Sheet, Tabs, timeAgo, useToast } from '../ui';

type Category = 'ERROR' | 'SUGERENCIA' | 'CONSULTA';
export type ReportStatus = 'ABIERTO' | 'EN_PROCESO' | 'RESUELTO' | 'DESCARTADO';

export const REPORT_CATEGORY_LABELS: Record<Category, string> = { ERROR: 'Algo no funciona', SUGERENCIA: 'Sugerencia', CONSULTA: 'Consulta' };
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = { ABIERTO: 'Recibido', EN_PROCESO: 'En revisión', RESUELTO: 'Resuelto', DESCARTADO: 'Cerrado' };
export const REPORT_STATUS_TONES: Record<ReportStatus, 'info' | 'warn' | 'ok' | undefined> = { ABIERTO: 'info', EN_PROCESO: 'warn', RESUELTO: 'ok', DESCARTADO: undefined };

export interface ReportAttachment { key: string; name: string; size: number; type: string; url?: string | null }
interface MyReport { id: number; category: Category; description: string; status: ReportStatus; response: string | null; createdAt: string; resolvedAt: string | null; attachments?: ReportAttachment[] }
interface SupportConfig { attachments: boolean; imageMaxBytes: number; videoMaxBytes: number; maxFiles: number }

/** Capturas y videos de un reporte (miniaturas, abren en otra pestaña). */
export const ReportAttachments = ({ list }: { list?: ReportAttachment[] }) => {
  if (!list?.length) return null;
  return (
    <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
      {list.map((a) =>
        a.url && a.type.startsWith('image/') ? (
          <a key={a.key} href={a.url} target="_blank" rel="noreferrer noopener" title={a.name}>
            <img src={a.url} alt={a.name} loading="lazy" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          </a>
        ) : a.url && a.type.startsWith('video/') ? (
          <video key={a.key} src={a.url} controls preload="metadata" style={{ width: 200, maxWidth: '100%', borderRadius: 8, background: '#000' }} />
        ) : (
          <span key={a.key} className="xs muted row" style={{ gap: 4 }}><Paperclip size={12} /> {a.name}</span>
        )
      )}
    </div>
  );
};

/** Sube un archivo directo al bucket de reportes (URL firmada) y devuelve la referencia para el reporte. */
const uploadReportFile = async (original: File, onProgress: (pct: number) => void): Promise<ReportAttachment> => {
  const file = original.type.startsWith('image/') ? await compressImage(original) : original;
  const contentType = file.type || 'application/octet-stream';
  const { key, uploadUrl } = await apiSend<{ key: string; uploadUrl: string }>('POST', '/support/attachments/presign', { fileName: file.name, contentType, size: file.size });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, 'No se pudo subir el archivo.')));
    xhr.onerror = () => reject(new ApiError(0, 'Se cortó la conexión durante la subida.'));
    xhr.send(file);
  });
  return { key, name: file.name, size: file.size, type: contentType };
};

const NewReportForm = ({ onSent }: { onSent: () => void }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const [category, setCategory] = useState<Category>('ERROR');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<ReportAttachment[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const config = useQuery({ queryKey: ['support-config'], queryFn: () => apiGet<SupportConfig>('/support/config'), staleTime: 10 * 60_000 });
  const errors = recentClientErrors();
  const addFiles = async (list: FileList | null) => {
    if (!list?.length || !config.data) return;
    for (const f of Array.from(list).slice(0, config.data.maxFiles - files.length)) {
      const max = f.type.startsWith('video/') ? config.data.videoMaxBytes : config.data.imageMaxBytes;
      if (f.size > max) {
        toast(`"${f.name}" es demasiado pesado (máximo ${formatBytes(max)}).`, true);
        continue;
      }
      setProgress(0);
      try {
        const up = await uploadReportFile(f, setProgress);
        setFiles((prev) => [...prev, up]);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'No se pudo subir', true);
      } finally {
        setProgress(null);
      }
    }
  };
  const send = useMutation({
    mutationFn: () =>
      apiSend('POST', '/support/reports', {
        category,
        description,
        pageUrl: window.location.pathname + window.location.search,
        appVersion: import.meta.env.VITE_APP_VERSION ?? null,
        clientErrors: errors,
        attachments: files,
      }),
    onSuccess: () => {
      toast('¡Gracias! Recibimos tu reporte y te avisamos cuando lo revisemos.');
      setDescription('');
      setFiles([]);
      qc.invalidateQueries({ queryKey: ['my-reports'] });
      onSent();
    },
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), send.mutate())}>
      <Field label="Tipo">
        <div className="chips">
          {(Object.keys(REPORT_CATEGORY_LABELS) as Category[]).map((c) => (
            <button type="button" key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{REPORT_CATEGORY_LABELS[c]}</button>
          ))}
        </div>
      </Field>
      <Field label="¿Qué pasó?" hint="Contanos qué estabas haciendo y qué esperabas que pasara.">
        <textarea className="textarea" rows={5} required minLength={10} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: quise adjuntar una foto en un mensaje y me salió un error." />
      </Field>
      {config.data?.attachments && (
        <div className="stack" style={{ gap: 8 }}>
          {files.map((f) => (
            <div key={f.key} className="row card" style={{ padding: '8px 12px' }}>
              {f.type.startsWith('video/') ? <Film size={16} /> : <ImageIcon size={16} />}
              <span className="grow truncate small">{f.name}</span>
              <span className="xs muted">{formatBytes(f.size)}</span>
              <button type="button" className="icon-btn" onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))} aria-label="Quitar"><X size={16} /></button>
            </div>
          ))}
          {progress !== null && <div><div className="xs muted">Subiendo… {progress}%</div><div className="progress"><span style={{ width: `${progress}%` }} /></div></div>}
          {files.length < (config.data.maxFiles ?? 5) && (
            <label className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
              <Paperclip size={16} /> {progress !== null ? 'Subiendo…' : 'Adjuntar captura o video'}
              <input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,image/heic,video/mp4,video/webm,video/quicktime" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} disabled={progress !== null} />
            </label>
          )}
          <span className="xs muted">Una captura de pantalla o un video corto de lo que pasa ayuda muchísimo. Las fotos se achican solas.</span>
        </div>
      )}
      <p className="xs muted">
        Se envía junto con tu usuario, la pantalla en la que estás{errors.length ? ` y ${errors.length} error${errors.length > 1 ? 'es' : ''} técnico${errors.length > 1 ? 's' : ''} recientes` : ''}. No incluye contraseñas ni mensajes.
      </p>
      <button className="btn btn-accent btn-block" disabled={send.isPending || progress !== null || description.trim().length < 10}>{send.isPending ? 'Enviando…' : 'Enviar reporte'}</button>
    </form>
  );
};

const MyReports = () => {
  const reports = useQuery({ queryKey: ['my-reports'], queryFn: () => apiGet<MyReport[]>('/support/reports/mine') });
  if (!reports.data?.length) return <Empty title={reports.isLoading ? 'Cargando…' : 'Todavía no enviaste reportes'} />;
  return (
    <div className="card list" style={{ overflow: 'hidden' }}>
      {reports.data.map((r) => (
        <div key={r.id} className="list-item" style={{ alignItems: 'flex-start' }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <Badge tone={REPORT_STATUS_TONES[r.status]}>{REPORT_STATUS_LABELS[r.status]}</Badge>
              <span className="xs muted">{REPORT_CATEGORY_LABELS[r.category]} · {timeAgo(r.createdAt)}</span>
            </div>
            <div className="small" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.description}</div>
            <ReportAttachments list={r.attachments} />
            {r.response && <div className="alert alert-info xs" style={{ marginTop: 6 }}><b>Respuesta de soporte:</b> {r.response}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

export const ReportProblemSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [tab, setTab] = useState<'new' | 'mine'>('new');
  return (
    <Sheet open={open} onClose={onClose} title="Reportar un problema">
      <div className="stack">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'new', label: 'Nuevo reporte' }, { value: 'mine', label: 'Mis reportes' }]} />
        {tab === 'new' ? <NewReportForm onSent={() => setTab('mine')} /> : <MyReports />}
      </div>
    </Sheet>
  );
};
