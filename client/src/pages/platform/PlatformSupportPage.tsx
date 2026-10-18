import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '../../lib/api';
import { Badge, Chips, Empty, ErrorBox, Field, PageHeader, Sheet, Skeleton, timeAgo, useToast } from '../../ui';
import { REPORT_CATEGORY_LABELS, REPORT_STATUS_LABELS, REPORT_STATUS_TONES, type ReportStatus } from '../../school/ReportProblem';
import type { Paginated } from '../../school/types';

interface SupportReport {
  id: number;
  category: keyof typeof REPORT_CATEGORY_LABELS;
  description: string;
  pageUrl: string | null;
  userAgent: string | null;
  ip: string | null;
  clientErrors: Array<{ message: string; source?: string | null; at?: string | null }>;
  status: ReportStatus;
  response: string | null;
  createdAt: string;
  schoolName: string | null;
  Reporter?: { id: number; firstName: string; lastName: string; email?: string; dni?: string | null } | null;
}

const STATUSES = Object.keys(REPORT_STATUS_LABELS) as ReportStatus[];

/** Problemas, sugerencias y consultas que mandan los usuarios desde "Reportar un problema" (equipo Sentryx). */
export default function PlatformSupportPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<ReportStatus | ''>('ABIERTO');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SupportReport | null>(null);
  const [reply, setReply] = useState({ status: 'EN_PROCESO' as ReportStatus, response: '' });

  const list = useQuery({
    queryKey: ['platform-support', status, page],
    queryFn: () => apiGet<Paginated<SupportReport> & { openCount: number }>(`/platform/support-reports?page=${page}&limit=30${status ? `&status=${status}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const update = useMutation({
    mutationFn: () => apiSend('PATCH', `/platform/support-reports/${selected!.id}`, { status: reply.status, response: reply.response || null }),
    onSuccess: () => (toast('Reporte actualizado: le avisamos a quien lo envió'), setSelected(null), qc.invalidateQueries({ queryKey: ['platform-support'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  const open = (r: SupportReport) => (setSelected(r), setReply({ status: r.status === 'ABIERTO' ? 'EN_PROCESO' : r.status, response: r.response ?? '' }));

  return (
    <div className="stack-lg">
      <PageHeader title="Reportes de usuarios" subtitle={list.data ? `${list.data.openCount} sin resolver` : 'Problemas, sugerencias y consultas'} />
      <Chips
        value={status}
        onChange={(v) => (setStatus(v), setPage(1))}
        items={[{ value: '' as const, label: 'Todos' }, ...STATUSES.map((s) => ({ value: s, label: REPORT_STATUS_LABELS[s] }))]}
      />
      {list.error && <ErrorBox error={list.error} />}
      {list.isLoading && <Skeleton count={5} h={64} />}
      {list.data && !list.data.data.length && <Empty title="No hay reportes con ese estado" />}
      {!!list.data?.data.length && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {list.data.data.map((r) => (
            <button key={r.id} className="list-item" style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--border)', width: '100%', textAlign: 'left', cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => open(r)}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 6 }}>
                  <b className="small">#{r.id}</b>
                  <Badge tone={REPORT_STATUS_TONES[r.status]}>{REPORT_STATUS_LABELS[r.status]}</Badge>
                  <Badge>{REPORT_CATEGORY_LABELS[r.category]}</Badge>
                  {r.clientErrors.length > 0 && <Badge tone="danger">{r.clientErrors.length} errores</Badge>}
                </div>
                <div className="small truncate" style={{ marginTop: 4 }}>{r.description}</div>
                <div className="xs muted">{r.Reporter ? `${r.Reporter.firstName} ${r.Reporter.lastName}` : 'Usuario eliminado'}{r.schoolName ? ` · ${r.schoolName}` : ''} · {timeAgo(r.createdAt)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {list.data && list.data.pagination.totalPages > 1 && (
        <div className="row-between">
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span className="xs muted">Página {page} de {list.data.pagination.totalPages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= list.data.pagination.totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      )}

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected ? `Reporte #${selected.id}` : ''}>
        {selected && (
          <div className="stack">
            <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{selected.description}</div>
            <div className="xs muted stack" style={{ gap: 2 }}>
              <span><b>Usuario:</b> {selected.Reporter ? `${selected.Reporter.firstName} ${selected.Reporter.lastName} (${selected.Reporter.email ?? selected.Reporter.dni ?? '—'})` : '—'}</span>
              {selected.schoolName && <span><b>Colegio:</b> {selected.schoolName}</span>}
              <span><b>Pantalla:</b> {selected.pageUrl ?? '—'}</span>
              <span><b>IP:</b> {selected.ip ?? '—'}</span>
              <span><b>Navegador:</b> {selected.userAgent ?? '—'}</span>
            </div>
            {selected.clientErrors.length > 0 && (
              <pre className="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 8, borderRadius: 8, background: 'rgba(0,0,0,.05)' }}>
                {selected.clientErrors.map((e) => `${e.at ?? ''} ${e.source ?? ''}\n  ${e.message}`).join('\n')}
              </pre>
            )}
            <Field label="Estado">
              <select className="select" value={reply.status} onChange={(e) => setReply({ ...reply, status: e.target.value as ReportStatus })}>
                {STATUSES.map((s) => <option key={s} value={s}>{REPORT_STATUS_LABELS[s]}</option>)}
              </select>
            </Field>
            <Field label="Respuesta al usuario (opcional)" hint="Le llega como notificación (y por email al cerrar el reporte).">
              <textarea className="textarea" rows={4} maxLength={4000} value={reply.response} onChange={(e) => setReply({ ...reply, response: e.target.value })} />
            </Field>
            <button className="btn btn-accent btn-block" disabled={update.isPending} onClick={() => update.mutate()}>{update.isPending ? 'Guardando…' : 'Guardar'}</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
