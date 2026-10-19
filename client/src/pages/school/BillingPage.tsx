import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Search, Users, UserMinus, UserPlus, Receipt, Lock, Info } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { downloadText, csvRow } from '../../lib/csv';
import { useSchool } from '../../school/SchoolContext';
import { Badge, Card, Chips, ErrorBox, PageHeader, Skeleton, fmtDate } from '../../ui';
import { CATEGORY_LABELS, type Category } from '../../school/types';
import { PLAN_CODES, PLAN_NAMES, PLAN_TONES, type PlanCode } from '../../school/plans';

interface Line { userId: number; name: string; login: string; category: Category; activeFrom: string; deactivatedAt: string | null; activeDays: number; plan?: PlanCode; amount: number }
interface Billing {
  cycle: string;
  currentCycle: string;
  cycles: string[];
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
  unitPrice: number;
  currency: 'ARS';
  period: { start: string; end: string };
  billableUsers: number;
  activeNow: number;
  deactivatedInCycle: number;
  newInCycle: number;
  byCategory: Record<Category, { users: number; amount: number }>;
  byPlan?: Record<PlanCode, { users: number; amount: number; price: number }>;
  total: number;
  lines: Line[];
}

const ars = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const monthName = (c: string) => {
  const s = new Date(`${c}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s[0].toUpperCase() + s.slice(1);
};

const Kpi = ({ icon, value, label, tone }: { icon: React.ReactNode; value: string | number; label: string; tone?: string }) => (
  <Card>
    <div className="stat" style={{ padding: 0 }}>
      <div className="row-between"><div className="value" style={tone ? { color: tone } : undefined}>{value}</div><span className="muted">{icon}</span></div>
      <div className="label">{label}</div>
    </div>
  </Card>
);

/**
 * Facturación del servicio: costo por usuario activo. Se cobra el mes completo a toda cuenta que tuvo
 * acceso al menos un día del ciclo (aunque se haya desactivado después). Desglose usuario por usuario.
 */
export default function BillingPage() {
  const { session } = useSchool();
  const [cycle, setCycle] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'ALL' | 'DEACTIVATED'>('ALL');
  const b = useQuery({
    queryKey: ['billing', cycle],
    queryFn: () => apiGet<Billing>(`/school/billing${cycle ? `?cycle=${cycle}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const d = b.data;

  const lines = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (d?.lines ?? []).filter(
      (l) => (cat === 'ALL' || (cat === 'DEACTIVATED' ? !!l.deactivatedAt : l.category === cat)) && (!s || l.name.toLowerCase().includes(s) || l.login.toLowerCase().includes(s))
    );
  }, [d, q, cat]);

  const exportCsv = () => {
    if (!d) return;
    const rows = d.lines.map((l) => csvRow([l.name, l.login, CATEGORY_LABELS[l.category], fmtDate(l.activeFrom), l.deactivatedAt ? fmtDate(l.deactivatedAt) : '', l.activeDays, PLAN_NAMES[l.plan ?? 'BASICO'], l.amount]));
    downloadText(`facturacion-${session?.school.slug ?? 'colegio'}-${d.cycle}.csv`, `usuario;login;categoria;alta;baja;dias_activo;plan;monto_ars\n${rows.join('\n')}\n;;;;;;TOTAL;${d.total}`);
  };

  return (
    <div className="stack-lg">
      <PageHeader
        title="Facturación"
        subtitle={`${session?.school.name ?? ''} · Costo por usuario activo`}
        actions={d && <button className="btn btn-ghost" onClick={exportCsv}><Download size={16} /> Exportar CSV</button>}
      />

      {d && (
        <div className="row wrap">
          <select className="select" style={{ maxWidth: 240 }} value={d.cycle} onChange={(e) => setCycle(e.target.value)} aria-label="Ciclo de facturación">
            {d.cycles.map((c) => <option key={c} value={c}>{monthName(c)}{c === d.currentCycle ? ' (en curso)' : ''}</option>)}
          </select>
          {d.status === 'OPEN' ? <Badge tone="info">Estimación del mes en curso</Badge> : <Badge tone="ok"><Lock size={12} /> Liquidación cerrada {d.closedAt && `el ${fmtDate(d.closedAt)}`}</Badge>}
        </div>
      )}

      {b.error && <ErrorBox error={b.error} retry={() => b.refetch()} />}
      {!d && !b.error && <Skeleton count={3} h={90} />}

      {d && (
        <>
          <div className="card card-pad" style={{ background: '#000', color: '#fff', border: 0, backgroundImage: 'radial-gradient(120% 140% at 0% 0%, rgba(11,120,251,.55), transparent 55%), radial-gradient(120% 140% at 100% 0%, rgba(246,149,10,.45), transparent 55%)' }}>
            <div className="small" style={{ opacity: 0.8 }}>{d.status === 'OPEN' ? 'Total estimado a pagar' : 'Total del ciclo'} · {monthName(d.cycle)}</div>
            <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.1, margin: '6px 0' }}>{ars(d.total)}</div>
            <div className="small" style={{ opacity: 0.85 }}>{d.billableUsers} usuarios · cada uno según su plan (desde {ars(d.unitPrice)} por mes)</div>
          </div>

          <div className="grid grid-2 grid-4">
            <Kpi icon={<Users size={18} />} value={d.billableUsers} label="Usuarios activos del mes (facturables)" />
            <Kpi icon={<Receipt size={18} />} value={d.activeNow} label="Con acceso hoy" />
            <Kpi icon={<UserMinus size={18} />} value={d.deactivatedInCycle} label="Desactivados en el período" tone={d.deactivatedInCycle ? 'var(--accent)' : undefined} />
            <Kpi icon={<UserPlus size={18} />} value={d.newInCycle} label="Altas en el período" />
          </div>

          <Card>
            <div className="stack" style={{ gap: 10 }}>
              <h2 className="h3">Por categoría</h2>
              {(Object.keys(d.byCategory) as Category[]).map((c) => (
                <div key={c} className="row-between small">
                  <span>{CATEGORY_LABELS[c]}</span>
                  <span><b>{d.byCategory[c].users}</b> · {ars(d.byCategory[c].amount)}</span>
                </div>
              ))}
            </div>
          </Card>

          {d.byPlan && (
            <Card>
              <div className="stack" style={{ gap: 10 }}>
                <div className="row-between"><h2 className="h3">Por plan</h2><Link to="/planes" className="small">Cambiar planes</Link></div>
                {PLAN_CODES.filter((p) => d.byPlan![p].users).map((p) => (
                  <div key={p} className="row-between small">
                    <span><Badge tone={PLAN_TONES[p]}>{PLAN_NAMES[p]}</Badge> {ars(d.byPlan![p].price)} c/u</span>
                    <span><b>{d.byPlan![p].users}</b> · {ars(d.byPlan![p].amount)}</span>
                  </div>
                ))}
                <p className="xs muted">Si alguien cambió de plan durante el mes, se cobra el plan más alto que tuvo.</p>
              </div>
            </Card>
          )}

          <div className="alert alert-info small">
            <Info size={18} />
            <div>
              Se cobra el <b>mes completo</b> a cada cuenta que tuvo acceso <b>al menos un día</b> del ciclo ({fmtDate(d.period.start)} al {fmtDate(new Date(new Date(d.period.end).getTime() - 1))}), aunque se haya desactivado después.
              Desactivar a alguien deja de cobrarse <b>desde el mes siguiente</b>. Nada se borra: el historial queda para auditar.
              Para desactivar cuentas, entrá a <Link to="/personas">Personas</Link>.
            </div>
          </div>

          <section className="stack">
            <h2 className="h2">Detalle por usuario</h2>
            <div className="row wrap">
              <label className="input row" style={{ gap: 8, flex: '2 1 220px' }}>
                <Search size={16} className="muted" />
                <input style={{ border: 0, outline: 0, background: 'transparent', color: 'inherit', flex: 1, font: 'inherit', minWidth: 0 }} placeholder="Buscar por nombre, DNI o email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
              </label>
            </div>
            <Chips
              value={cat}
              onChange={setCat}
              items={[
                { value: 'ALL', label: `Todos (${d.lines.length})` },
                ...(Object.keys(d.byCategory) as Category[]).filter((c) => d.byCategory[c].users).map((c) => ({ value: c, label: `${CATEGORY_LABELS[c].split(' /')[0]} (${d.byCategory[c].users})` })),
                ...(d.deactivatedInCycle ? [{ value: 'DEACTIVATED' as const, label: `Desactivados (${d.deactivatedInCycle})` }] : []),
              ]}
            />
            <div className="table-wrap card">
              <table className="table">
                <thead>
                  <tr><th>Usuario</th><th>Categoría</th><th>Plan</th><th>Alta</th><th>Baja</th><th style={{ textAlign: 'right' }}>Días</th><th style={{ textAlign: 'right' }}>Monto</th></tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.userId}>
                      <td>
                        <Link to={`/personas/${l.userId}`} style={{ color: 'inherit', fontWeight: 600 }}>{l.name}</Link>
                        {l.login && <div className="xs muted">{l.login}</div>}
                      </td>
                      <td className="small">{CATEGORY_LABELS[l.category].split(' /')[0]}</td>
                      <td className="small"><Badge tone={PLAN_TONES[l.plan ?? 'BASICO']}>{PLAN_NAMES[l.plan ?? 'BASICO']}</Badge></td>
                      <td className="small">{fmtDate(l.activeFrom, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                      <td className="small">{l.deactivatedAt ? <Badge tone="warn">{fmtDate(l.deactivatedAt, { day: 'numeric', month: 'short' })}</Badge> : '—'}</td>
                      <td className="small" style={{ textAlign: 'right' }}>{l.activeDays}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{ars(l.amount)}</td>
                    </tr>
                  ))}
                  {!lines.length && <tr><td colSpan={7} className="muted small">Sin resultados.</td></tr>}
                </tbody>
                <tfoot>
                  <tr><td colSpan={6} style={{ fontWeight: 800 }}>Total {cat !== 'ALL' || q ? '(filtrado)' : ''}</td><td style={{ textAlign: 'right', fontWeight: 900 }}>{ars(lines.reduce((s, l) => s + l.amount, 0))}</td></tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
