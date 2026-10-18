/**
 * Registro de auditoría: quién hizo qué, desde qué IP y cuándo.
 * Lo usan Administración → Auditoría (un colegio) y Plataforma → Auditoría (todo Sentryx).
 */
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { Badge, Empty, ErrorBox, Skeleton } from '../ui';
import type { Paginated } from './types';

interface LogUser { id: number; firstName: string; lastName: string; email?: string; dni?: string | null }
export interface ActivityRow { id: number; method: string; path: string; statusCode: number; ip: string | null; userAgent: string | null; durationMs: number; createdAt: string; User?: LogUser | null }
export interface ChangeRow { id: number; entity: string; entityId: number | null; action: string; before: unknown; after: unknown; ip: string | null; userAgent: string | null; createdAt: string; schoolName?: string | null; User?: LogUser | null }

interface Filters { from: string; to: string; ip: string; q: string }
const EMPTY_FILTERS: Filters = { from: '', to: '', ip: '', q: '' };

const dateTime = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const who = (u?: LogUser | null) => (u ? `${u.firstName} ${u.lastName}` : 'Sin sesión');
/** Navegador resumido ("Chrome · Android") a partir del user-agent. */
const device = (ua: string | null) => {
  if (!ua) return '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Otro';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
};

const SESSION_ACTIONS: Record<string, string> = {
  login: 'Ingresó',
  'login-failed': 'Ingreso fallido',
  'password-change': 'Cambió su contraseña',
  'password-reset-by-email': 'Recuperó la contraseña por email',
};
const describeChange = (row: ChangeRow) => (row.entity === 'Session' ? SESSION_ACTIONS[row.action] ?? row.action : `${row.entity}${row.entityId ? ` #${row.entityId}` : ''} · ${row.action}`);

const FilterBar = ({ value, onChange, searchLabel }: { value: Filters; onChange: (f: Filters) => void; searchLabel: string }) => (
  <div className="row wrap" style={{ gap: 8 }}>
    <label className="row xs muted" style={{ gap: 4 }}>Desde<input type="date" className="input" style={{ width: 150 }} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></label>
    <label className="row xs muted" style={{ gap: 4 }}>Hasta<input type="date" className="input" style={{ width: 150 }} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></label>
    <input className="input" style={{ flex: '1 1 140px' }} placeholder="IP" value={value.ip} onChange={(e) => onChange({ ...value, ip: e.target.value })} />
    <input className="input" style={{ flex: '1 1 180px' }} placeholder={searchLabel} value={value.q} onChange={(e) => onChange({ ...value, q: e.target.value })} />
  </div>
);

const toQuery = (f: Filters, page: number) =>
  new URLSearchParams({ page: String(page), limit: '50', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim())) }).toString();

/** Lista paginada con filtros: la usan las dos vistas de abajo. */
function useAuditList<T>(key: string, path: string, filters: Filters, page: number) {
  return useQuery({ queryKey: ['audit', key, filters, page], queryFn: () => apiGet<Paginated<T>>(`${path}?${toQuery(filters, page)}`), placeholderData: keepPreviousData });
}

const Pager = ({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) =>
  totalPages > 1 ? (
    <div className="row-between">
      <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
      <span className="xs muted">Página {page} de {totalPages}</span>
      <button className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Siguiente</button>
    </div>
  ) : null;

/** Cada acción que modificó algo (método, ruta, resultado, IP, duración). */
export const ActivityLogView = ({ path }: { path: string }) => {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const list = useAuditList<ActivityRow>('activity' + path, path, filters, page);
  return (
    <div className="stack">
      <FilterBar value={filters} onChange={(f) => (setFilters(f), setPage(1))} searchLabel="Buscar en la ruta (ej: grades)" />
      {list.error && <ErrorBox error={list.error} />}
      {list.isLoading && <Skeleton count={6} h={48} />}
      {list.data && !list.data.data.length && <Empty title="Sin actividad para esos filtros" />}
      {!!list.data?.data.length && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {list.data.data.map((row) => (
            <div key={row.id} className="list-item wrap" style={{ gap: 8 }}>
              <div className="grow" style={{ minWidth: 220 }}>
                <div className="small"><b>{who(row.User)}</b> <span className="muted">{row.method}</span> <code className="xs">{row.path}</code></div>
                <div className="xs muted">{dateTime(row.createdAt)} · IP {row.ip ?? '—'} · {device(row.userAgent)} · {row.durationMs} ms</div>
              </div>
              <Badge tone={row.statusCode >= 500 ? 'danger' : row.statusCode >= 400 ? 'warn' : 'ok'}>{row.statusCode}</Badge>
            </div>
          ))}
        </div>
      )}
      {list.data && <Pager page={page} totalPages={list.data.pagination.totalPages} onPage={setPage} />}
    </div>
  );
};

/** Cambios sensibles (antes/después) e ingresos a la cuenta. */
export const ChangeLogView = ({ path, showSchool = false }: { path: string; showSchool?: boolean }) => {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const list = useAuditList<ChangeRow>('changes' + path, path, filters, page);
  return (
    <div className="stack">
      <FilterBar value={filters} onChange={(f) => (setFilters(f), setPage(1))} searchLabel="Entidad o acción (ej: Student, login-failed)" />
      {list.error && <ErrorBox error={list.error} />}
      {list.isLoading && <Skeleton count={6} h={48} />}
      {list.data && !list.data.data.length && <Empty title="Sin registros para esos filtros" />}
      {!!list.data?.data.length && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {list.data.data.map((row) => (
            <div key={row.id} className="list-item" style={{ display: 'block' }}>
              <button className="row wrap" style={{ gap: 8, background: 'none', border: 0, padding: 0, width: '100%', textAlign: 'left', color: 'inherit', cursor: row.before || row.after ? 'pointer' : 'default' }} onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                <div className="grow" style={{ minWidth: 220 }}>
                  <div className="small"><b>{who(row.User)}</b> · {describeChange(row)}</div>
                  <div className="xs muted">{dateTime(row.createdAt)} · IP {row.ip ?? '—'} · {device(row.userAgent)}{showSchool && row.schoolName ? ` · ${row.schoolName}` : ''}</div>
                </div>
                {row.action === 'login-failed' && <Badge tone="danger">Fallido</Badge>}
              </button>
              {openId === row.id && !!(row.before || row.after) && (
                <pre className="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8, padding: 8, background: 'var(--surface-2, rgba(0,0,0,.04))', borderRadius: 8 }}>
                  {row.before ? `Antes: ${JSON.stringify(row.before, null, 1)}\n` : ''}{row.after ? `Después: ${JSON.stringify(row.after, null, 1)}` : ''}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
      {list.data && <Pager page={page} totalPages={list.data.pagination.totalPages} onPage={setPage} />}
    </div>
  );
};
