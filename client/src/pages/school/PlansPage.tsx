import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Check, X } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Avatar, Badge, Card, Chips, Empty, ErrorBox, PageHeader, Skeleton, Tabs, timeAgo, useToast } from '../../ui';
import { Entity, Action } from '../../school/permissions';
import { PLAN_CODES, PLAN_NAMES, PLAN_TONES, PlanCode, PlanInfo, ars, formatBytesShort } from '../../school/plans';
import type { Category } from '../../school/types';

interface Member {
  userId: number;
  name: string;
  login: string;
  avatar: string | null;
  category: Category;
  categoryLabel: string;
  plan: PlanCode;
  storageUsed: number;
  storageLimit: number;
}
interface MembersResponse { members: Member[]; summary: { counts: Record<PlanCode, number>; monthly: number; activeTotal: number } }
interface PlanRequestRow {
  id: number; userId: number; plan: PlanCode; note: string | null; status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'; createdAt: string; currentPlan: PlanCode;
  User: { firstName: string; lastName: string; avatar: string | null };
  context: { kind: 'storage'; fileName?: string; fileSize?: number; used?: number; limit?: number } | null;
  approvers: string[];
  canResolve: boolean;
}

const CATEGORY_FILTERS: Array<{ value: Category | ''; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'DOCENTE', label: 'Docentes' },
  { value: 'DIRECTIVO', label: 'Directivos' },
  { value: 'FAMILIA', label: 'Familias' },
  { value: 'ESTUDIANTE', label: 'Estudiantes' },
];

const PeopleTab = ({ catalog }: { catalog: PlanInfo[] }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSchool();
  const canChange = can(Entity.PLANS, Action.UPDATE);
  const [category, setCategory] = useState<Category | ''>('DOCENTE');
  const [planFilter, setPlanFilter] = useState<PlanCode | ''>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkPlan, setBulkPlan] = useState<PlanCode>('INTEGRAL');
  const query = new URLSearchParams({ ...(category ? { category } : {}), ...(planFilter ? { plan: planFilter } : {}), ...(q.trim().length >= 2 ? { q: q.trim() } : {}) });
  const members = useQuery({ queryKey: ['plan-members', category, planFilter, q.trim().length >= 2 ? q.trim() : ''], queryFn: () => apiGet<MembersResponse>(`/school/plans/members?${query}`), placeholderData: keepPreviousData });

  const change = useMutation({
    mutationFn: (input: { userIds: number[]; plan: PlanCode }) => apiSend<{ changed: number }>('PUT', '/school/plans/members', input),
    onSuccess: (r, v) => {
      toast(r.changed ? `${r.changed === 1 ? 'Plan cambiado' : `${r.changed} planes cambiados`} a ${PLAN_NAMES[v.plan]}` : 'Ya tenían ese plan');
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['plan-members'] });
      qc.invalidateQueries({ queryKey: ['plan-requests'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const list = members.data?.members ?? [];
  const summary = members.data?.summary;
  const allSelected = list.length > 0 && list.every((m) => selected.includes(m.userId));

  return (
    <div className="stack">
      {summary && (
        <div className="grid grid-2 grid-4">
          {PLAN_CODES.map((code) => {
            const info = catalog.find((p) => p.code === code);
            return (
              <Card key={code}>
                <div className="stat" style={{ padding: 0 }}>
                  <div className="row-between"><div className="value">{summary.counts[code]}</div><Badge tone={PLAN_TONES[code]}>{PLAN_NAMES[code]}</Badge></div>
                  <div className="label">{info ? `${ars(info.price)} c/u · ${info.storageGb} GB` : ''}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {summary && <div className="alert alert-info small">Hoy: {summary.activeTotal} personas con acceso · {ars(summary.monthly)} por mes. Si alguien cambia de plan durante el mes, se cobra el más alto que tuvo.</div>}

      <Chips value={category} onChange={(v) => (setCategory(v), setSelected([]))} items={CATEGORY_FILTERS} />
      <div className="row wrap">
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 14 }} className="muted" />
          <input className="input" style={{ paddingLeft: 42 }} placeholder="Buscar por nombre o DNI" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" style={{ flex: '0 1 200px' }} value={planFilter} onChange={(e) => (setPlanFilter(e.target.value as PlanCode | ''), setSelected([]))}>
          <option value="">Todos los planes</option>
          {PLAN_CODES.map((code) => <option key={code} value={code}>{PLAN_NAMES[code]}</option>)}
        </select>
      </div>

      {canChange && list.length > 0 && (
        <div className="card row wrap" style={{ padding: '10px 14px', gap: 10, position: 'sticky', top: 64, zIndex: 2 }}>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? list.map((m) => m.userId) : [])} /> {selected.length ? `${selected.length} elegidas` : 'Elegir todas'}
          </label>
          <span className="grow" />
          <select className="select" style={{ width: 170 }} value={bulkPlan} onChange={(e) => setBulkPlan(e.target.value as PlanCode)}>
            {PLAN_CODES.map((code) => <option key={code} value={code}>{PLAN_NAMES[code]}</option>)}
          </select>
          <button className="btn btn-sm" disabled={!selected.length || change.isPending} onClick={() => change.mutate({ userIds: selected, plan: bulkPlan })}>Cambiar plan</button>
        </div>
      )}

      {members.error && <ErrorBox error={members.error} />}
      {members.isLoading && <Skeleton count={6} h={56} />}
      {!members.isLoading && !list.length && <Empty title="No hay personas con esos filtros" />}
      {list.length > 0 && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {list.map((m) => {
            const pct = Math.min(100, Math.round((m.storageUsed / m.storageLimit) * 100));
            return (
              <div key={m.userId} className="list-item wrap" style={{ gap: 10 }}>
                {canChange && <input type="checkbox" aria-label={`Elegir a ${m.name}`} checked={selected.includes(m.userId)} onChange={(e) => setSelected(e.target.checked ? [...selected, m.userId] : selected.filter((x) => x !== m.userId))} />}
                <Avatar name={m.name} src={m.avatar} size="sm" />
                <div className="grow" style={{ minWidth: 160 }}>
                  <div className="h3 truncate">{m.name}</div>
                  <div className="xs muted truncate">{m.categoryLabel}{m.login ? ` · ${m.login}` : ''}</div>
                  {(m.category === 'DOCENTE' || m.category === 'DIRECTIVO' || m.storageUsed > 0) && (
                    <div className="row xs muted" style={{ gap: 6, marginTop: 4 }}>
                      <div className="progress" style={{ width: 90 }}><span style={{ width: `${pct}%`, background: pct > 90 ? 'var(--danger)' : undefined }} /></div>
                      {formatBytesShort(m.storageUsed)} de {formatBytesShort(m.storageLimit)}
                    </div>
                  )}
                </div>
                {canChange ? (
                  <select className="select" style={{ width: 150 }} value={m.plan} aria-label={`Plan de ${m.name}`} onChange={(e) => change.mutate({ userIds: [m.userId], plan: e.target.value as PlanCode })}>
                    {PLAN_CODES.map((code) => <option key={code} value={code}>{PLAN_NAMES[code]}</option>)}
                  </select>
                ) : (
                  <Badge tone={PLAN_TONES[m.plan]}>{PLAN_NAMES[m.plan]}</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const RequestsTab = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<'PENDIENTE' | ''>('PENDIENTE');
  const requests = useQuery({ queryKey: ['plan-requests', status], queryFn: () => apiGet<PlanRequestRow[]>(`/school/plans/requests${status ? `?status=${status}` : ''}`) });
  const [replies, setReplies] = useState<Record<number, string>>({});
  const resolve = useMutation({
    mutationFn: ({ id, approve }: { id: number; approve: boolean }) => apiSend('POST', `/school/plans/requests/${id}/resolve`, { approve, reply: replies[id]?.trim() || null }),
    onSuccess: (_r, v) => (toast(v.approve ? 'Aprobado: ya tiene el plan nuevo' : 'Pedido rechazado'), qc.invalidateQueries({ queryKey: ['plan-requests'] }), qc.invalidateQueries({ queryKey: ['plan-members'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <div className="stack">
      <Chips value={status} onChange={setStatus} items={[{ value: 'PENDIENTE' as const, label: 'Pendientes' }, { value: '' as const, label: 'Todos' }]} />
      {requests.isLoading && <Skeleton count={3} h={70} />}
      {requests.data && !requests.data.length && <Empty title={status ? 'No hay pedidos pendientes' : 'Todavía no hubo pedidos'} />}
      {!!requests.data?.length && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {requests.data.map((r) => (
            <div key={r.id} className="list-item wrap" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Avatar name={`${r.User.firstName} ${r.User.lastName}`} src={r.User.avatar} size="sm" />
              <div className="grow" style={{ minWidth: 180 }}>
                <div className="h3">{r.User.firstName} {r.User.lastName}</div>
                <div className="small">De <b>{PLAN_NAMES[r.currentPlan]}</b> a <b>{PLAN_NAMES[r.plan]}</b> · <span className="muted">{timeAgo(r.createdAt)}</span></div>
                {r.context?.kind === 'storage' && (
                  <div className="small" style={{ marginTop: 4 }}>
                    Quiere subir <b>{r.context.fileName ?? 'un archivo'}</b>{r.context.fileSize ? ` (${formatBytesShort(r.context.fileSize)})` : ''}{r.context.used != null && r.context.limit ? ` y ya usa ${formatBytesShort(r.context.used)} de ${formatBytesShort(r.context.limit)}` : ''}.
                  </div>
                )}
                {r.note && <div className="small muted" style={{ marginTop: 4 }}>Motivo: “{r.note}”</div>}
                {r.approvers.length > 0 && <div className="xs muted" style={{ marginTop: 4 }}>Le llegó a: {r.approvers.join(', ')}</div>}
                {r.canResolve && <input className="input" style={{ marginTop: 8, minHeight: 36 }} maxLength={300} placeholder="Respuesta (opcional): le llega con la notificación" value={replies[r.id] ?? ''} onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })} />}
              </div>
              {r.canResolve ? (
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm btn-ghost" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, approve: false })}><X size={14} /> Rechazar</button>
                  <button className="btn btn-sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, approve: true })}><Check size={14} /> Aprobar</button>
                </div>
              ) : (
                <Badge tone={r.status === 'APROBADA' ? 'ok' : r.status === 'RECHAZADA' ? 'danger' : 'info'}>{r.status === 'PENDIENTE' ? 'Pendiente' : r.status === 'APROBADA' ? 'Aprobado' : 'Rechazado'}</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CatalogTab = ({ catalog }: { catalog: PlanInfo[] }) => (
  <div className="grid grid-2">
    {catalog.map((plan) => (
      <Card key={plan.code}>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row-between">
            <Badge tone={PLAN_TONES[plan.code]}>{plan.name}</Badge>
            <span className="h2">{ars(plan.price)}<span className="xs muted"> por persona/mes</span></span>
          </div>
          <div className="xs muted" style={{ fontWeight: 700 }}>PERSONAL</div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{plan.forStaff.map((line) => <li key={line}>{line}</li>)}</ul>
          <div className="xs muted" style={{ fontWeight: 700 }}>FAMILIAS Y ESTUDIANTES</div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{plan.forFamilies.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      </Card>
    ))}
  </div>
);

/** Planes: la Representante Legal asigna el plan de cada docente, directivo y familia. */
export default function PlansPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'people' | 'requests' | 'catalog'>(params.get('tab') === 'pedidos' ? 'requests' : 'people');
  const catalog = useQuery({ queryKey: ['plan-catalog'], queryFn: () => apiGet<PlanInfo[]>('/school/plans/catalog'), staleTime: Infinity });
  const pending = useQuery({ queryKey: ['plan-requests', 'PENDIENTE'], queryFn: () => apiGet<PlanRequestRow[]>('/school/plans/requests?status=PENDIENTE') });
  const pendingCount = pending.data?.length ?? 0;
  const items = useMemo(
    () => [
      { value: 'people' as const, label: 'Personas' },
      { value: 'requests' as const, label: pendingCount ? `Pedidos (${pendingCount})` : 'Pedidos' },
      { value: 'catalog' as const, label: 'Qué incluye cada plan' },
    ],
    [pendingCount]
  );
  return (
    <div className="stack-lg">
      <PageHeader title="Planes" subtitle="Cada persona tiene su plan: define lo que puede usar, su espacio para archivos y lo que se factura." />
      <Tabs value={tab} onChange={setTab} items={items} />
      {catalog.error && <ErrorBox error={catalog.error} />}
      {tab === 'people' && <PeopleTab catalog={catalog.data ?? []} />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'catalog' && <CatalogTab catalog={catalog.data ?? []} />}
    </div>
  );
}


