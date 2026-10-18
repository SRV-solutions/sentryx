/** "Reportar un problema": va asociado al usuario logueado, con la pantalla y los últimos errores del navegador. */
import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '../lib/api';
import { recentClientErrors } from '../lib/clientErrors';
import { Badge, Empty, Field, Sheet, Tabs, timeAgo, useToast } from '../ui';

type Category = 'ERROR' | 'SUGERENCIA' | 'CONSULTA';
export type ReportStatus = 'ABIERTO' | 'EN_PROCESO' | 'RESUELTO' | 'DESCARTADO';

export const REPORT_CATEGORY_LABELS: Record<Category, string> = { ERROR: 'Algo no funciona', SUGERENCIA: 'Sugerencia', CONSULTA: 'Consulta' };
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = { ABIERTO: 'Recibido', EN_PROCESO: 'En revisión', RESUELTO: 'Resuelto', DESCARTADO: 'Cerrado' };
export const REPORT_STATUS_TONES: Record<ReportStatus, 'info' | 'warn' | 'ok' | undefined> = { ABIERTO: 'info', EN_PROCESO: 'warn', RESUELTO: 'ok', DESCARTADO: undefined };

interface MyReport { id: number; category: Category; description: string; status: ReportStatus; response: string | null; createdAt: string; resolvedAt: string | null }

const NewReportForm = ({ onSent }: { onSent: () => void }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const [category, setCategory] = useState<Category>('ERROR');
  const [description, setDescription] = useState('');
  const errors = recentClientErrors();
  const send = useMutation({
    mutationFn: () =>
      apiSend('POST', '/support/reports', {
        category,
        description,
        pageUrl: window.location.pathname + window.location.search,
        appVersion: import.meta.env.VITE_APP_VERSION ?? null,
        clientErrors: errors,
      }),
    onSuccess: () => {
      toast('¡Gracias! Recibimos tu reporte y te avisamos cuando lo revisemos.');
      setDescription('');
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
      <p className="xs muted">
        Se envía junto con tu usuario, la pantalla en la que estás{errors.length ? ` y ${errors.length} error${errors.length > 1 ? 'es' : ''} técnico${errors.length > 1 ? 's' : ''} recientes` : ''}. No incluye contraseñas ni mensajes.
      </p>
      <button className="btn btn-accent btn-block" disabled={send.isPending || description.trim().length < 10}>{send.isPending ? 'Enviando…' : 'Enviar reporte'}</button>
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
