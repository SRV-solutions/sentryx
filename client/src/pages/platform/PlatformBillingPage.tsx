import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { downloadText, csvRow } from '../../lib/csv';
import { Badge, ErrorBox, PageHeader, Skeleton } from '../../ui';

interface Overview {
  cycle: string;
  currentCycle: string;
  unitPrice: number;
  billableUsers: number;
  total: number;
  schools: Array<{ schoolId: number; name: string; active: boolean; status: 'OPEN' | 'CLOSED'; billableUsers: number; activeNow: number; total: number }>;
}

const ars = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const lastMonths = (from: string, n = 12) => {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m--;
    if (!m) (m = 12), y--;
  }
  return out;
};
const monthName = (c: string) => {
  const s = new Date(`${c}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s[0].toUpperCase() + s.slice(1);
};

/** Facturación de todos los colegios (equipo Sentryx). El detalle usuario por usuario está en cada colegio. */
export default function PlatformBillingPage() {
  const [cycle, setCycle] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['platform-billing', cycle], queryFn: () => apiGet<Overview>(`/platform/billing${cycle ? `?cycle=${cycle}` : ''}`), placeholderData: keepPreviousData });
  const d = q.data;
  return (
    <div className="stack-lg">
      <PageHeader
        title="Facturación global"
        subtitle="Todos los colegios de la plataforma"
        actions={d && <button className="btn btn-ghost" onClick={() => downloadText(`sentryx-facturacion-${d.cycle}.csv`, `colegio;usuarios;monto_ars\n${d.schools.map((s) => csvRow([s.name, s.billableUsers, s.total])).join('\n')}\nTOTAL;${d.billableUsers};${d.total}`)}><Download size={16} /> CSV</button>}
      />
      {q.error && <ErrorBox error={q.error} />}
      {!d && !q.error && <Skeleton count={3} h={80} />}
      {d && (
        <>
          <select className="select" style={{ maxWidth: 240 }} value={d.cycle} onChange={(e) => setCycle(e.target.value)} aria-label="Ciclo">
            {lastMonths(d.currentCycle).map((c) => <option key={c} value={c}>{monthName(c)}{c === d.currentCycle ? ' (en curso)' : ''}</option>)}
          </select>
          <div className="card card-pad" style={{ background: '#000', color: '#fff', border: 0, backgroundImage: 'radial-gradient(120% 140% at 0% 0%, rgba(11,120,251,.55), transparent 55%), radial-gradient(120% 140% at 100% 0%, rgba(246,149,10,.45), transparent 55%)' }}>
            <div className="small" style={{ opacity: 0.8 }}>{d.cycle === d.currentCycle ? 'Estimado' : 'Total'} · {monthName(d.cycle)}</div>
            <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.1, margin: '6px 0' }}>{ars(d.total)}</div>
            <div className="small" style={{ opacity: 0.85 }}>{d.billableUsers} usuarios · {d.schools.length} colegios · {ars(d.unitPrice)} por usuario</div>
          </div>
          <div className="table-wrap card">
            <table className="table">
              <thead><tr><th>Colegio</th><th style={{ textAlign: 'right' }}>Usuarios</th><th style={{ textAlign: 'right' }}>Monto</th></tr></thead>
              <tbody>
                {d.schools.map((s) => (
                  <tr key={s.schoolId}>
                    <td>{s.name} {!s.active && <Badge tone="danger">Suspendido</Badge>} {s.status === 'CLOSED' && <Badge tone="ok">Cerrado</Badge>}</td>
                    <td style={{ textAlign: 'right' }}>{s.billableUsers}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{ars(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
