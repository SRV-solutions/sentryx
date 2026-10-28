import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check, Eye, Plus, RefreshCw, Pencil } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Badge, Chips, Empty, ErrorBox, Field, PageHeader, Sheet, Skeleton, Tabs, timeAgo, useToast } from '../../ui';
import type { Severity } from '../../school/types';
import { Entity, Action } from '../../school/permissions';
import { NoEmailPanel } from '../../school/NoEmailPanel';

interface AlertRow {
  id: number;
  severity: Severity;
  message: string;
  value: number;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  note: string | null;
  updatedAt: string;
  Student: { id: number; firstName: string; lastName: string; Enrollments?: Array<{ Division?: { name: string } }> };
  /** Puede venir null (regla borrada o alerta de otro tipo): la tarjeta no debe romperse. */
  AttendanceRule: { name: string; type: Rule['type'] } | null;
  HandledBy?: { firstName: string; lastName: string } | null;
}

interface Rule {
  id: number;
  name: string;
  levelId: number | null;
  type: 'TOTAL' | 'CONSECUTIVE' | 'PERCENT' | 'WINDOW';
  threshold: number;
  windowDays: number | null;
  countJustified: boolean;
  severity: Severity;
  notifyGuardians: boolean;
  active: boolean;
  Level?: { name: string } | null;
}

const SEV: Record<Severity, { label: string; tone: 'danger' | 'warn' | 'info' }> = {
  CRITICAL: { label: 'Crítica', tone: 'danger' },
  WARNING: { label: 'Atención', tone: 'warn' },
  INFO: { label: 'Info', tone: 'info' },
};
const RULE_TYPES: Record<Rule['type'], string> = {
  TOTAL: 'Total de faltas en el ciclo',
  CONSECUTIVE: 'Inasistencias consecutivas',
  PERCENT: '% de inasistencia',
  WINDOW: 'Faltas en los últimos N días',
};

const AlertsList = () => {
  const { can } = useSchool();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<'ACTIVE' | 'RESOLVED'>('ACTIVE');
  const [severity, setSeverity] = useState<'' | Severity>('');
  const q = useQuery({
    queryKey: ['alerts', status, severity],
    queryFn: () => apiGet<AlertRow[]>(`/school/alerts?status=${status}${severity ? `&severity=${severity}` : ''}`),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiSend('PATCH', `/school/alerts/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <div className="stack">
      <Chips
        value={`${status}|${severity}`}
        onChange={(v) => {
          const [s, sev] = v.split('|');
          setStatus(s as 'ACTIVE' | 'RESOLVED');
          setSeverity(sev as '' | Severity);
        }}
        items={[
          { value: 'ACTIVE|', label: 'Activas' },
          { value: 'ACTIVE|CRITICAL', label: 'Críticas' },
          { value: 'ACTIVE|WARNING', label: 'Atención' },
          { value: 'RESOLVED|', label: 'Resueltas' },
        ]}
      />
      {q.error && <ErrorBox error={q.error} />}
      {q.isLoading && <Skeleton count={5} h={80} />}
      {q.data && !q.data.length && <Empty title="Sin alertas" text="Ningún alumno supera las reglas configuradas." icon={<BellRing size={36} strokeWidth={1.5} />} />}
      <div className="stack">
        {q.data?.map((a) => (
          <div key={a.id} className="card card-pad stack" style={{ gap: 8, borderLeft: `4px solid var(--${a.severity === 'CRITICAL' ? 'danger' : a.severity === 'WARNING' ? 'warn' : 'primary'})` }}>
            <div className="row-between">
              <Link to={`/alumnos/${a.Student.id}`} className="h3">{a.Student.lastName}, {a.Student.firstName}</Link>
              <Badge tone={SEV[a.severity].tone}>{SEV[a.severity].label}</Badge>
            </div>
            <div className="small">
              {a.AttendanceRule?.name ?? a.message} · <b>{a.value}{a.AttendanceRule?.type === 'PERCENT' ? '%' : a.AttendanceRule?.type === 'CONSECUTIVE' ? ' días seguidos' : ' faltas'}</b>
              {a.Student.Enrollments?.[0]?.Division && <span className="muted"> · {a.Student.Enrollments[0].Division.name}</span>}
            </div>
            <div className="xs muted">
              {a.status === 'ACKNOWLEDGED' && a.HandledBy ? `En seguimiento por ${a.HandledBy.firstName} ${a.HandledBy.lastName} · ` : ''}
              Actualizada {timeAgo(a.updatedAt)}
              {a.note && ` · ${a.note}`}
            </div>
            {can(Entity.ALERTS, Action.UPDATE) && a.status !== 'RESOLVED' && (
              <div className="row wrap">
                {a.status === 'OPEN' && (
                  <button className="btn btn-sm btn-ghost" onClick={() => update.mutate({ id: a.id, status: 'ACKNOWLEDGED' })}><Eye size={14} /> Tomar seguimiento</button>
                )}
                <button className="btn btn-sm btn-ghost" onClick={() => update.mutate({ id: a.id, status: 'RESOLVED' })}><Check size={14} /> Resolver</button>
                <Link to={`/comunicados/nuevo?alumno=${a.Student.id}`} className="btn btn-sm btn-ghost">Escribir a la familia</Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const emptyRule = { name: '', levelId: null as number | null, type: 'TOTAL' as Rule['type'], threshold: 10, windowDays: 30 as number | null, countJustified: true, severity: 'WARNING' as Severity, notifyGuardians: false, active: true };

const RulesPanel = () => {
  const { can } = useSchool();
  const qc = useQueryClient();
  const toast = useToast();
  const rules = useQuery({ queryKey: ['alert-rules'], queryFn: () => apiGet<Rule[]>('/school/alerts/rules') });
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<{ levels: Array<{ id: number; name: string }> }>('/school/structure') });
  const [edit, setEdit] = useState<(typeof emptyRule & { id?: number }) | null>(null);

  const save = useMutation({
    mutationFn: (r: typeof emptyRule & { id?: number }) => {
      const { id, ...body } = r;
      const payload = { ...body, windowDays: r.type === 'WINDOW' ? r.windowDays : null };
      return id ? apiSend('PATCH', `/school/alerts/rules/${id}`, payload) : apiSend('POST', '/school/alerts/rules', payload);
    },
    onSuccess: () => {
      toast('Regla guardada. Recalculando alertas…');
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      apiSend('POST', '/school/alerts/recompute').then(() => qc.invalidateQueries({ queryKey: ['alerts'] }));
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const recompute = useMutation({
    mutationFn: () => apiSend<{ created: number; resolved: number }>('POST', '/school/alerts/recompute'),
    onSuccess: (r) => {
      toast(`Listo: ${r.created} nuevas · ${r.resolved} resueltas`);
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (edit) save.mutate(edit);
  };

  return (
    <div className="stack">
      <div className="alert alert-info small">
        Las reglas definen cuándo se dispara una alerta. Cuando tengan la normativa vigente, ajustá los umbrales acá: no hace falta tocar el sistema.
      </div>
      {can(Entity.ALERT_RULES, Action.UPDATE) && (
        <div className="row wrap">
          <button className="btn btn-sm" onClick={() => setEdit({ ...emptyRule })}><Plus size={16} /> Nueva regla</button>
          <button className="btn btn-sm btn-ghost" onClick={() => recompute.mutate()} disabled={recompute.isPending}><RefreshCw size={16} /> Recalcular</button>
        </div>
      )}
      {rules.isLoading && <Skeleton count={4} h={64} />}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {rules.data?.map((r) => (
          <div key={r.id} className="list-item" style={{ opacity: r.active ? 1 : 0.5 }}>
            <div className="grow">
              <div className="h3">{r.name}</div>
              <div className="xs muted">
                {RULE_TYPES[r.type]} ≥ {r.threshold}{r.type === 'PERCENT' ? '%' : ''}{r.type === 'WINDOW' ? ` en ${r.windowDays} días` : ''} · {r.Level?.name ?? 'Todos los niveles'}
                {!r.countJustified && ' · solo injustificadas'}
                {r.notifyGuardians && ' · avisa a la familia'}
              </div>
            </div>
            <Badge tone={SEV[r.severity].tone}>{SEV[r.severity].label}</Badge>
            {can(Entity.ALERT_RULES, Action.UPDATE) && (
              <button className="icon-btn" onClick={() => setEdit({ ...r, windowDays: r.windowDays ?? 30 })} aria-label="Editar"><Pencil size={16} /></button>
            )}
          </div>
        ))}
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar regla' : 'Nueva regla'}>
        {edit && (
          <form className="stack" onSubmit={submit}>
            <Field label="Nombre">
              <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Ej: 15 inasistencias (Res. XXXX)" required minLength={3} />
            </Field>
            <Field label="Tipo">
              <select className="select" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as Rule['type'] })}>
                {Object.entries(RULE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div className="grid grid-2">
              <Field label={edit.type === 'PERCENT' ? 'Umbral (%)' : edit.type === 'CONSECUTIVE' ? 'Días seguidos' : 'Faltas'}>
                <input className="input" type="number" min={0.25} step={0.25} value={edit.threshold} onChange={(e) => setEdit({ ...edit, threshold: Number(e.target.value) })} />
              </Field>
              {edit.type === 'WINDOW' && (
                <Field label="Ventana (días)">
                  <input className="input" type="number" min={1} max={365} value={edit.windowDays ?? 30} onChange={(e) => setEdit({ ...edit, windowDays: Number(e.target.value) })} />
                </Field>
              )}
            </div>
            <Field label="Nivel">
              <select className="select" value={edit.levelId ?? ''} onChange={(e) => setEdit({ ...edit, levelId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Todos los niveles</option>
                {structure.data?.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Gravedad">
              <select className="select" value={edit.severity} onChange={(e) => setEdit({ ...edit, severity: e.target.value as Severity })}>
                <option value="INFO">Info</option>
                <option value="WARNING">Atención</option>
                <option value="CRITICAL">Crítica (avisa también por email)</option>
              </select>
            </Field>
            <label className="check"><input type="checkbox" checked={edit.countJustified} onChange={(e) => setEdit({ ...edit, countJustified: e.target.checked })} /> Contar también las faltas justificadas</label>
            <label className="check"><input type="checkbox" checked={edit.notifyGuardians} onChange={(e) => setEdit({ ...edit, notifyGuardians: e.target.checked })} /> Avisar automáticamente a la familia</label>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Regla activa</label>
            <button className="btn btn-block" disabled={save.isPending}>Guardar regla</button>
          </form>
        )}
      </Sheet>
    </div>
  );
};

type Tab = 'alertas' | 'reglas' | 'sin-email';
const TABS: Tab[] = ['alertas', 'reglas', 'sin-email'];

export default function AlertsPage() {
  // La pestaña vive en la URL: el inicio linkea directo a ?tab=emails (?tab=sin-email sigue andando: hay avisos y tutoriales viejos).
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') === 'emails' ? 'sin-email' : (params.get('tab') as Tab | null);
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'alertas';
  const setTab = (t: Tab) => setParams(t === 'alertas' ? {} : { tab: t === 'sin-email' ? 'emails' : t }, { replace: true });
  return (
    <div className="stack">
      <PageHeader title="Alertas" subtitle="Seguimiento de asistencia y de los emails de las cuentas de estudiantes." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'alertas', label: 'Alertas' }, { value: 'sin-email', label: 'Emails de estudiantes' }, { value: 'reglas', label: 'Reglas' }]} />
      {tab === 'alertas' ? <AlertsList /> : tab === 'reglas' ? <RulesPanel /> : <NoEmailPanel />}
    </div>
  );
}
