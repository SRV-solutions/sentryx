import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { Badge, Card, Empty, ErrorBox, Field, PageHeader, Sheet, Skeleton, fmtDate, useToast } from '../../ui';
import { PlanGate } from '../../school/PlanGate';
import { PlanFeature, ars, usePlan } from '../../school/plans';
import { KIND_LABELS, RECEIPT_KIND_LABELS, Receipt, SITUATION_LABELS, StaffPosition, WeeklySchedule, periodLabel } from '../../school/staffRecords';

const openReceipt = async (id: number) => {
  // Se abre la pestaña antes del pedido: los navegadores de celular bloquean ventanas abiertas después de un await.
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null; // la pestaña del recibo no puede tocar la de Sentryx
  try {
    const file = await apiGet<{ url: string }>(`/school/payroll/${id}/file`);
    if (tab) tab.location.href = file.url;
    else window.location.href = file.url;
  } catch (err) {
    tab?.close();
    throw err;
  }
};

const ReceiptsCard = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const receipts = useQuery({ queryKey: ['my-receipts'], queryFn: () => apiGet<Receipt[]>('/school/payroll/mine') });
  const [ack, setAck] = useState<Receipt | null>(null);
  const [disagree, setDisagree] = useState(false);
  const [observation, setObservation] = useState('');
  const view = useMutation({ mutationFn: openReceipt, onSuccess: () => qc.invalidateQueries({ queryKey: ['my-receipts'] }), onError: (e: Error) => toast(e.message, true) });
  const send = useMutation({
    mutationFn: () => apiSend('POST', `/school/payroll/${ack!.id}/acknowledge`, { agreed: !disagree, observation: disagree ? observation : null }),
    onSuccess: () => (toast(disagree ? 'Registramos tu disconformidad: administración va a revisarlo' : 'Conformidad registrada'), setAck(null), qc.invalidateQueries({ queryKey: ['my-receipts'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <Card>
      <div className="stack">
        <h2 className="h2 row"><FileText size={20} /> Mis recibos de sueldo</h2>
        {receipts.isLoading && <Skeleton count={2} h={56} />}
        {receipts.error && <ErrorBox error={receipts.error} />}
        {receipts.data && !receipts.data.length && <Empty title="Todavía no hay recibos" text="Cuando administración suba tu recibo, te llega una notificación." />}
        {!!receipts.data?.length && (
          <div className="list" style={{ margin: '0 -16px' }}>
            {receipts.data.map((r) => (
              <div key={r.id} className="list-item wrap" style={{ gap: 8 }}>
                <div className="grow" style={{ minWidth: 160 }}>
                  <div className="h3">{periodLabel(r.period)} · {RECEIPT_KIND_LABELS[r.kind]}</div>
                  <div className="xs muted">{r.netAmount !== null ? `Neto ${ars(r.netAmount)} · ` : ''}subido el {fmtDate(r.createdAt)}</div>
                </div>
                {r.acknowledgedAt ? (
                  <Badge tone={r.agreed ? 'ok' : 'warn'}>{r.agreed ? 'Conforme' : 'En disconformidad'}</Badge>
                ) : (
                  <button className="btn btn-sm" onClick={() => (setAck(r), setDisagree(false), setObservation(''))}><CheckCircle2 size={14} /> Dar conformidad</button>
                )}
                <button className="btn btn-sm btn-ghost" disabled={view.isPending} onClick={() => view.mutate(r.id)}><Eye size={14} /> Ver</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <Sheet open={!!ack} onClose={() => setAck(null)} title={ack ? `Recibo de ${periodLabel(ack.period)}` : ''}>
        {ack && (
          <div className="stack">
            <p className="small">Revisá el recibo antes de responder. La conformidad queda registrada con fecha y hora.</p>
            <button className="btn btn-ghost" onClick={() => view.mutate(ack.id)}><Eye size={16} /> Abrir el recibo</button>
            <div className="chips">
              <button type="button" className={`chip ${!disagree ? 'active' : ''}`} onClick={() => setDisagree(false)}>Estoy conforme</button>
              <button type="button" className={`chip ${disagree ? 'active' : ''}`} onClick={() => setDisagree(true)}><AlertTriangle size={14} /> No estoy conforme</button>
            </div>
            {disagree && (
              <Field label="¿Qué está mal?"><textarea className="textarea" rows={3} maxLength={1000} required value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Ej: faltan las horas de la suplencia de septiembre" /></Field>
            )}
            <button className="btn btn-block" disabled={send.isPending || (disagree && !observation.trim())} onClick={() => send.mutate()}>{send.isPending ? 'Enviando…' : 'Confirmar'}</button>
          </div>
        )}
      </Sheet>
    </Card>
  );
};

/** Mi legajo (plan Profesional): mis cargos, horas, horario y recibos de sueldo. */
export default function MyRecordPage() {
  const { hasFeature } = usePlan();
  const record = useQuery({
    queryKey: ['my-record'],
    queryFn: () => apiGet<{ positions: StaffPosition[]; weeklyHours: number }>('/school/staff-records/me'),
    enabled: hasFeature(PlanFeature.STAFF_RECORDS),
  });
  return (
    <div className="stack-lg">
      <PageHeader title="Mi legajo" subtitle="Tus cargos, horas, horario y recibos de sueldo." />
      <PlanGate feature={PlanFeature.STAFF_RECORDS} title="Legajo y recibos de sueldo">
        {record.isLoading && <Skeleton count={2} h={90} />}
        {record.error && <ErrorBox error={record.error} />}
        {record.data && (
          <Card>
            <div className="stack">
              <div className="row-between">
                <h2 className="h2">Cargos y horas</h2>
                <Badge tone="info">{record.data.weeklyHours} h semanales</Badge>
              </div>
              {!record.data.positions.length && <p className="small muted">Administración todavía no cargó tus cargos.</p>}
              {record.data.positions.map((p) => (
                <div key={p.id} className="row wrap" style={{ gap: 6 }}>
                  <span className="h3 grow">{p.title}</span>
                  <Badge>{KIND_LABELS[p.kind]}{p.weeklyHours ? ` · ${p.weeklyHours} h` : ''}</Badge>
                  <Badge tone="ok">{SITUATION_LABELS[p.situation]}</Badge>
                  {p.shift && <Badge>{p.shift}</Badge>}
                  {p.Level && <Badge>{p.Level.name}</Badge>}
                </div>
              ))}
              <h3 className="h3" style={{ marginTop: 8 }}>Horario semanal</h3>
              <WeeklySchedule positions={record.data.positions} />
            </div>
          </Card>
        )}
        <ReceiptsCard />
      </PlanGate>
    </div>
  );
}
