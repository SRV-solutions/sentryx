import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Upload, Eye, ChevronDown, ChevronUp, X } from 'lucide-react';
import { apiGet, apiSend, uploadFile } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Avatar, Badge, Card, Empty, ErrorBox, Field, PageHeader, Sheet, Skeleton, Tabs, fmtDate, useToast } from '../../ui';
import { Entity, Action } from '../../school/permissions';
import { PlanGate } from '../../school/PlanGate';
import { PlanFeature } from '../../school/plans';
import type { Structure } from '../../school/types';
import {
  DAYS, KIND_LABELS, RECEIPT_KIND_LABELS, Receipt, ReceiptKind, SHIFTS, SITUATION_LABELS, ScheduleSlot, StaffPosition, WeeklySchedule,
  currentPeriod, lastPeriods, periodLabel, PositionKind, PositionSituation,
} from '../../school/staffRecords';

interface StaffRecord {
  userId: number;
  name: string;
  avatar: string | null;
  dni: string | null;
  roles: string[];
  plan: string;
  seesOwnRecords: boolean;
  weeklyHours: number;
  positions: StaffPosition[];
}

type PositionForm = {
  id?: number;
  userId: number;
  title: string;
  kind: PositionKind;
  situation: PositionSituation;
  weeklyHours: number;
  shift: string;
  levelId: number | '';
  startDate: string;
  endDate: string;
  schedule: ScheduleSlot[];
  notes: string;
};

const emptyForm = (userId: number): PositionForm => ({ userId, title: '', kind: 'CARGO', situation: 'TITULAR', weeklyHours: 0, shift: 'Mañana', levelId: '', startDate: '', endDate: '', schedule: [], notes: '' });

const PositionSheet = ({ form, onClose, personName }: { form: PositionForm | null; onClose: () => void; personName: string }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const [f, setF] = useState<PositionForm | null>(form);
  const [error, setError] = useState('');
  if (form && (!f || f.id !== form.id || f.userId !== form.userId)) setF(form);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f!, levelId: f!.levelId || null, shift: f!.shift || null, startDate: f!.startDate || null, endDate: f!.endDate || null, notes: f!.notes || null };
      const { id, userId, ...rest } = body;
      return id ? apiSend('PATCH', `/school/staff-positions/${id}`, rest) : apiSend('POST', '/school/staff-positions', { userId, ...rest });
    },
    onSuccess: () => (toast('Legajo actualizado'), qc.invalidateQueries({ queryKey: ['staff-records'] }), onClose()),
    onError: (e: Error) => setError(e.message),
  });
  if (!form || !f) return null;
  const setSlot = (i: number, patch: Partial<ScheduleSlot>) => setF({ ...f, schedule: f.schedule.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <Sheet open={!!form} onClose={onClose} title={`${f.id ? 'Editar' : 'Nuevo'} cargo · ${personName}`}>
      <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), setError(''), save.mutate())}>
        <Field label="Cargo"><input className="input" required maxLength={120} placeholder="Ej: Maestra de 3º grado, Profesor de Matemática" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid grid-2">
          <Field label="Tipo">
            <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PositionKind })}>
              {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Situación">
            <select className="select" value={f.situation} onChange={(e) => setF({ ...f, situation: e.target.value as PositionSituation })}>
              {Object.entries(SITUATION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Horas semanales"><input className="input" type="number" min={0} max={80} step={0.5} value={f.weeklyHours} onChange={(e) => setF({ ...f, weeklyHours: Number(e.target.value) })} /></Field>
          <Field label="Turno">
            <select className="select" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
              <option value="">—</option>
              {SHIFTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Nivel">
            <select className="select" value={f.levelId} onChange={(e) => setF({ ...f, levelId: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">Toda la institución</option>
              {structure.data?.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Desde"><input className="input" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        </div>
        <Field label="Horario">
          <div className="stack" style={{ gap: 6 }}>
            {f.schedule.map((s, i) => (
              <div key={i} className="row wrap" style={{ gap: 6 }}>
                <select className="select" style={{ width: 120 }} value={s.day} onChange={(e) => setSlot(i, { day: Number(e.target.value) })}>
                  {DAYS.slice(1).map((d, idx) => <option key={d} value={idx + 1}>{d}</option>)}
                </select>
                <input className="input" type="time" style={{ width: 110 }} value={s.from} onChange={(e) => setSlot(i, { from: e.target.value })} />
                <input className="input" type="time" style={{ width: 110 }} value={s.to} onChange={(e) => setSlot(i, { to: e.target.value })} />
                <input className="input" style={{ flex: '1 1 120px' }} placeholder="Materia / curso (opcional)" maxLength={60} value={s.label ?? ''} onChange={(e) => setSlot(i, { label: e.target.value })} />
                <button type="button" className="icon-btn" aria-label="Quitar franja" onClick={() => setF({ ...f, schedule: f.schedule.filter((_x, j) => j !== i) })}><X size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setF({ ...f, schedule: [...f.schedule, { day: 1, from: '08:00', to: '09:20' }] })}><Plus size={14} /> Agregar franja</button>
          </div>
        </Field>
        <Field label="Observaciones"><textarea className="textarea" rows={2} maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {error && <div className="alert alert-danger small">{error}</div>}
        <button className="btn btn-block" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Sheet>
  );
};

const RecordsTab = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSchool();
  const canEdit = can(Entity.STAFF_RECORDS, Action.UPDATE);
  const records = useQuery({ queryKey: ['staff-records'], queryFn: () => apiGet<StaffRecord[]>('/school/staff-records') });
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<PositionForm | null>(null);
  const [q, setQ] = useState('');
  const remove = useMutation({
    mutationFn: (id: number) => apiSend('DELETE', `/school/staff-positions/${id}`),
    onSuccess: () => (toast('Cargo eliminado'), qc.invalidateQueries({ queryKey: ['staff-records'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  const list = (records.data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const total = list.reduce((s, r) => s + r.weeklyHours, 0);
  const editing = records.data?.find((r) => r.userId === form?.userId);
  return (
    <div className="stack">
      <div className="row wrap">
        <input className="input" style={{ flex: '1 1 220px' }} placeholder="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} />
        <Badge tone="info">{total} h semanales en total</Badge>
      </div>
      {records.isLoading && <Skeleton count={6} h={56} />}
      {records.error && <ErrorBox error={records.error} />}
      {records.data && !list.length && <Empty title="No hay personal" />}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {list.map((r) => (
          <div key={r.userId} style={{ borderBottom: '1px solid var(--border)' }}>
            <button className="list-item" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen(open === r.userId ? null : r.userId)}>
              <Avatar name={r.name} src={r.avatar} size="sm" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="h3 truncate">{r.name}</div>
                <div className="xs muted truncate">{r.roles.join(' · ')} · {r.positions.filter((p) => p.active).length} cargos · plan {r.plan}</div>
              </div>
              <Badge>{r.weeklyHours} h</Badge>
              {open === r.userId ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open === r.userId && (
              <div className="stack" style={{ padding: '0 16px 16px' }}>
                {!r.seesOwnRecords && <div className="alert alert-info xs">Con su plan, esta persona no ve su legajo ni recibe recibos digitales. Podés cambiarle el plan en <Link to="/planes">Planes</Link>.</div>}
                {r.positions.map((p) => (
                  <div key={p.id} className="row wrap card" style={{ padding: 10, gap: 6, opacity: p.active ? 1 : 0.5 }}>
                    <span className="h3 grow">{p.title}</span>
                    <Badge>{KIND_LABELS[p.kind]} · {p.weeklyHours} h</Badge>
                    <Badge tone="ok">{SITUATION_LABELS[p.situation]}</Badge>
                    {p.shift && <Badge>{p.shift}</Badge>}
                    {canEdit && (
                      <>
                        <button className="icon-btn" aria-label="Editar cargo" onClick={() => setForm({ ...emptyForm(r.userId), ...p, shift: p.shift ?? '', levelId: p.levelId ?? '', startDate: p.startDate ?? '', endDate: p.endDate ?? '', notes: p.notes ?? '' })}><Pencil size={15} /></button>
                        <button className="icon-btn" aria-label="Eliminar cargo" onClick={() => remove.mutate(p.id)}><Trash2 size={15} /></button>
                      </>
                    )}
                  </div>
                ))}
                <WeeklySchedule positions={r.positions.filter((p) => p.active)} />
                {canEdit && <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setForm(emptyForm(r.userId))}><Plus size={14} /> Agregar cargo u horas</button>}
              </div>
            )}
          </div>
        ))}
      </div>
      <PositionSheet form={form} onClose={() => setForm(null)} personName={editing?.name ?? ''} />
    </div>
  );
};

interface PayrollList {
  receipts: Receipt[];
  staff: Array<{ userId: number; name: string; dni: string | null; eligible: boolean }>;
  requiredPlan: string;
}

const ReceiptsTab = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSchool();
  const [params] = useSearchParams();
  const [period, setPeriod] = useState(params.get('period') ?? currentPeriod());
  const [kind, setKind] = useState<ReceiptKind>('SUELDO');
  const [busy, setBusy] = useState('');
  const [bulkResult, setBulkResult] = useState<{ created: Array<{ name: string }>; unmatched: Array<{ fileName: string; reason: string }> } | null>(null);
  const data = useQuery({ queryKey: ['payroll', period], queryFn: () => apiGet<PayrollList>(`/school/payroll?period=${period}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['payroll'] });

  const uploadOne = async (userId: number, file?: File) => {
    if (!file) return;
    setBusy(`Subiendo ${file.name}…`);
    try {
      const up = await uploadFile(file, { purpose: 'PAYROLL' });
      await apiSend('POST', '/school/payroll', { userId, period, kind, fileId: up.fileId });
      toast('Recibo subido: le avisamos a la persona');
      refresh();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy('');
    }
  };

  const uploadBulk = async (files: FileList | null) => {
    if (!files?.length) return;
    const ids: number[] = [];
    try {
      for (const [i, file] of [...files].entries()) {
        setBusy(`Subiendo ${i + 1} de ${files.length}…`);
        ids.push((await uploadFile(file, { purpose: 'PAYROLL' })).fileId);
      }
      setBusy('Asignando por DNI…');
      setBulkResult(await apiSend('POST', '/school/payroll/bulk', { period, kind, fileIds: ids }));
      refresh();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy('');
    }
  };

  const view = useMutation({
    mutationFn: async (id: number) => {
      const tab = window.open('', '_blank');
      if (tab) tab.opener = null; // la pestaña del recibo no puede tocar la de Sentryx
      const file = await apiGet<{ url: string }>(`/school/payroll/${id}/file`);
      if (tab) tab.location.href = file.url;
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiSend('DELETE', `/school/payroll/${id}`),
    onSuccess: () => (toast('Recibo anulado'), refresh()),
    onError: (e: Error) => toast(e.message, true),
  });

  const receiptOf = (userId: number) => data.data?.receipts.find((r) => r.userId === userId && r.kind === kind);
  const eligible = data.data?.staff.filter((s) => s.eligible) ?? [];
  const notEligible = data.data?.staff.filter((s) => !s.eligible) ?? [];
  const done = eligible.filter((s) => receiptOf(s.userId)).length;

  return (
    <div className="stack">
      <div className="row wrap">
        <select className="select" style={{ flex: '1 1 160px' }} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {lastPeriods().map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 140px' }} value={kind} onChange={(e) => setKind(e.target.value as ReceiptKind)}>
          {Object.entries(RECEIPT_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {can(Entity.PAYROLL, Action.CREATE) && (
          <label className="btn">
            <Upload size={16} /> Subir varios (por DNI)
            <input type="file" hidden multiple accept="application/pdf" onChange={(e) => (uploadBulk(e.target.files), (e.target.value = ''))} />
          </label>
        )}
      </div>
      <p className="xs muted">Carga masiva: el nombre de cada PDF tiene que incluir el DNI de la persona (ej: <code>recibo_28111222.pdf</code> o <code>28.111.222 Pérez.pdf</code>).</p>
      {busy && <div className="alert alert-info small">{busy}</div>}
      {bulkResult && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="alert alert-ok small">Asignados: {bulkResult.created.length}{bulkResult.created.length ? ` (${bulkResult.created.map((c) => c.name).join('; ')})` : ''}</div>
          {bulkResult.unmatched.map((u, i) => <div key={i} className="alert alert-warn xs"><b>{u.fileName}</b>: {u.reason}</div>)}
          <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setBulkResult(null)}>Cerrar</button>
        </div>
      )}
      {data.isLoading && <Skeleton count={5} h={56} />}
      {data.error && <ErrorBox error={data.error} />}
      {data.data && <div className="small muted">{done} de {eligible.length} recibos de {periodLabel(period)} subidos.</div>}
      {!!eligible.length && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {eligible.map((s) => {
            const r = receiptOf(s.userId);
            return (
              <div key={s.userId} className="list-item wrap" style={{ gap: 8 }}>
                <div className="grow" style={{ minWidth: 160 }}>
                  <div className="h3 truncate">{s.name}</div>
                  <div className="xs muted">{s.dni ? `DNI ${s.dni}` : 'Sin DNI (no entra en la carga masiva)'}</div>
                </div>
                {r ? (
                  <>
                    {r.acknowledgedAt ? (
                      r.agreed ? <Badge tone="ok">Conforme</Badge> : <span className="alert alert-warn xs" style={{ padding: '4px 10px', flex: '1 1 180px' }}><b>Disconforme:</b> {r.observation}</span>
                    ) : (
                      <Badge tone={r.viewedAt ? 'info' : undefined}>{r.viewedAt ? `Visto ${fmtDate(r.viewedAt)}` : 'Sin ver'}</Badge>
                    )}
                    <button className="icon-btn" aria-label="Ver recibo" onClick={() => view.mutate(r.id)}><Eye size={16} /></button>
                    {can(Entity.PAYROLL, Action.DELETE) && <button className="icon-btn" aria-label="Anular recibo" onClick={() => remove.mutate(r.id)}><Trash2 size={16} /></button>}
                  </>
                ) : (
                  can(Entity.PAYROLL, Action.CREATE) && (
                    <label className="btn btn-sm btn-ghost">
                      <Upload size={14} /> Subir
                      <input type="file" hidden accept="application/pdf" onChange={(e) => (uploadOne(s.userId, e.target.files?.[0]), (e.target.value = ''))} />
                    </label>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
      {!!notEligible.length && (
        <details className="card" style={{ padding: 14 }}>
          <summary className="small" style={{ cursor: 'pointer' }}>{notEligible.length} personas sin recibo digital (necesitan el plan {data.data?.requiredPlan})</summary>
          <p className="xs muted" style={{ marginTop: 8 }}>{notEligible.map((s) => s.name).join(' · ')}</p>
          <Link to="/planes" className="btn btn-sm btn-ghost">Ir a Planes</Link>
        </details>
      )}
    </div>
  );
};

/** Personal (Administración): legajos con cargos, horas y turnos, y recibos de sueldo. */
export default function StaffAdminPage() {
  const { can } = useSchool();
  const [params] = useSearchParams();
  const tabs = [
    ...(can(Entity.STAFF_RECORDS, Action.READ) ? [{ value: 'records' as const, label: 'Cargos, horas y turnos' }] : []),
    ...(can(Entity.PAYROLL, Action.READ) ? [{ value: 'receipts' as const, label: 'Recibos de sueldo' }] : []),
  ];
  const [tab, setTab] = useState<(typeof tabs)[number]['value'] | undefined>(params.get('tab') === 'recibos' && tabs.some((t) => t.value === 'receipts') ? 'receipts' : tabs[0]?.value);
  return (
    <div className="stack-lg">
      <PageHeader title="Personal" subtitle="Legajo docente y recibos de sueldo." />
      <PlanGate feature={PlanFeature.STAFF_RECORDS} title="Gestión del personal">
        {tabs.length > 1 && tab && <Tabs value={tab} onChange={setTab} items={tabs} />}
        {tab === 'records' && <RecordsTab />}
        {tab === 'receipts' && <ReceiptsTab />}
        {!tabs.length && <Card><p className="small">Tu rol no tiene acceso a esta sección.</p></Card>}
      </PlanGate>
    </div>
  );
}
