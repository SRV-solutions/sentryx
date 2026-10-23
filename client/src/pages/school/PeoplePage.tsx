import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, Users, ChevronRight } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { accountStatus } from '../../school/PersonProfile';
import { Avatar, Badge, Empty, ErrorBox, PageHeader, Skeleton, Tabs } from '../../ui';
import { ROLE_LABELS, isStaffRole, type SchoolRole, type Structure } from '../../school/types';
import { Entity, Action } from '../../school/permissions';

interface FamilyRow {
  id: number; firstName: string; lastName: string; avatar: string | null; lastLogin: string | null; mustChangePassword: boolean; isActive: boolean;
  email?: string | null; phone?: string | null; dni?: string | null;
  children: Array<{ id: number; firstName: string; lastName: string; relationship: string; division: string | null }>;
}
interface StaffRow {
  id: number; firstName: string; lastName: string; avatar: string | null; lastLogin: string | null; mustChangePassword: boolean; isActive: boolean; active: boolean;
  email?: string | null; phone?: string | null;
  roles: Array<{ role: SchoolRole; roleLabel: string; level: string | null; title: string | null; active: boolean }>;
}
interface Page<T> { data: T[]; pagination: { totalItems: number; currentPage: number; totalPages: number } }

const useDebounced = (v: string, ms = 300) => {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
};

/** Directorio: todas las familias (con sus hijos) y todo el personal, con búsqueda y filtros. */
export default function PeoplePage() {
  const { can } = useSchool();
  const [params, setParams] = useSearchParams();
  const type = (params.get('tipo') === 'personal' ? 'staff' : 'families') as 'families' | 'staff';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [divisionId, setDivisionId] = useState<number | ''>('');
  const [role, setRole] = useState<SchoolRole | ''>('');
  const [status, setStatus] = useState<'all' | 'never' | 'pending'>('all');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const manage = can(Entity.USERS, Action.UPDATE);

  useEffect(() => setPage(1), [type, search, divisionId, role, status]);

  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure') });
  const qs = new URLSearchParams({ type, page: String(page), limit: '30', status });
  if (search) qs.set('q', search);
  if (type === 'families' && divisionId) qs.set('divisionId', String(divisionId));
  if (type === 'staff' && role) qs.set('role', role);
  const list = useQuery({
    queryKey: ['people', type, qs.toString()],
    queryFn: () => apiGet<Page<FamilyRow | StaffRow>>(`/school/people?${qs}`),
    // Mientras carga, se mantiene la página anterior solo si es del mismo tipo (familias y personal tienen otras columnas).
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === type ? keepPreviousData(prev) : undefined),
  });

  const setType = (t: 'families' | 'staff') => setParams(t === 'staff' ? { tipo: 'personal' } : {}, { replace: true });
  const total = list.data?.pagination.totalItems ?? 0;

  return (
    <div className="stack">
      <PageHeader title="Personas" subtitle="Familias y personal de la institución. Tocá a alguien para ver su perfil." />
      <Tabs value={type} onChange={setType} items={[{ value: 'families', label: 'Familias' }, { value: 'staff', label: 'Personal' }]} />

      <div className="row wrap">
        <label className="input row grow" style={{ gap: 8, minWidth: 220, flex: '3 1 220px' }}>
          <Search size={16} className="muted" />
          <input
            style={{ border: 0, outline: 0, background: 'transparent', color: 'inherit', flex: 1, font: 'inherit', minWidth: 0 }}
            placeholder={type === 'families' ? 'Buscar por nombre, DNI, email o alumno' : 'Buscar por nombre, email o cargo'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar"
          />
        </label>
        {type === 'families' ? (
          <select className="select" style={{ flex: '1 1 140px' }} value={divisionId} onChange={(e) => setDivisionId(e.target.value ? Number(e.target.value) : '')} aria-label="División">
            <option value="">Todas las divisiones</option>
            {structure.data?.levels.map((l) => (
              <optgroup key={l.id} label={l.name}>
                {structure.data!.divisions.filter((d) => d.levelId === l.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </optgroup>
            ))}
          </select>
        ) : (
          <select className="select" style={{ flex: '1 1 140px' }} value={role} onChange={(e) => setRole(e.target.value as SchoolRole | '')} aria-label="Rol">
            <option value="">Todos los roles</option>
            {(Object.keys(ROLE_LABELS) as SchoolRole[]).filter(isStaffRole).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        )}
        {manage && (
          <select className="select" style={{ flex: '1 1 140px' }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Estado de la cuenta">
            <option value="all">Todas las cuentas</option>
            <option value="never">Nunca ingresaron</option>
            <option value="pending">Con contraseña temporal</option>
          </select>
        )}
      </div>

      {list.error && <ErrorBox error={list.error} retry={() => list.refetch()} />}
      {list.isLoading && <Skeleton count={8} h={64} />}
      {list.data && (
        <div className="xs muted">{total === 1 ? '1 persona' : `${total} personas`}{list.isFetching ? ' · actualizando…' : ''}</div>
      )}
      {list.data && !list.data.data.length && <Empty title="No encontramos personas" text={search ? 'Probá con otra búsqueda.' : undefined} icon={<Users size={36} strokeWidth={1.5} />} />}
      {!!list.data?.data.length && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {list.data.data.map((row) => {
            const name = `${row.lastName}, ${row.firstName}`;
            const st = manage ? accountStatus(row) : null;
            const detail =
              'children' in row
                ? (row.children ?? []).map((c) => `${c.relationship} de ${c.firstName}${c.division ? ` (${c.division})` : ''}`).join(' · ')
                : (row.roles ?? []).filter((r) => r.active).map((r) => r.title || `${r.roleLabel}${r.level ? ` · ${r.level}` : ''}`).join(' · ') || 'Sin roles activos';
            const contact = [row.phone, row.email].filter(Boolean).join(' · ');
            return (
              <Link key={row.id} to={`/personas/${row.id}`} className="list-item" style={{ opacity: type === 'staff' && !(row as StaffRow).active ? 0.55 : 1 }}>
                <Avatar name={`${row.firstName} ${row.lastName}`} src={row.avatar} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="h3 truncate">{name}</div>
                  <div className="xs muted truncate">{detail}</div>
                  {contact && <div className="xs truncate" style={{ color: 'var(--text-2)' }}>{contact}</div>}
                </div>
                {st && st.tone !== 'ok' && <span className="hide-mobile"><Badge tone={st.tone}>{st.text}</Badge></span>}
                <ChevronRight size={16} className="muted" />
              </Link>
            );
          })}
        </div>
      )}
      {(list.data?.pagination.totalPages ?? 0) > 1 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span className="small muted">Página {page} de {list.data!.pagination.totalPages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= list.data!.pagination.totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  );
}
