import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Users, CheckSquare, Square } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Avatar, Skeleton, Badge, ErrorBox } from '../ui';
import type { Paginated } from './types';
import { useDebounced } from './announcements';

export interface FamilyRow {
  userId: number;
  firstName: string;
  lastName: string;
  avatar: string | null;
  email: string | null;
  phone: string | null;
  receivesCommunications: boolean;
  students: Array<{ id: number; firstName: string; lastName: string; relationship: string; division: { id: number; name: string; gradeYear: number; levelId: number; level: string } | null }>;
}

interface Props {
  value: number[];
  onChange: (ids: number[]) => void;
  levels: Array<{ id: number; name: string }>;
  divisions: Array<{ id: number; name: string; levelId: number; gradeYear?: number }>;
}

const ordinal = (n: number) => `${n}º`;

/**
 * Listado completo de familias del alcance del autor para elegir destinatarios una por una:
 * búsqueda por familia o alumno y filtros por nivel, grado/año y división. "Seleccionar filtradas"
 * agrega todas las que cumplen el filtro actual (sirve para "todo 3º" o "todas las de Primario").
 */
export const FamilyPicker = ({ value, onChange, levels, divisions }: Props) => {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [levelId, setLevelId] = useState<number | ''>('');
  const [gradeYear, setGradeYear] = useState<number | ''>('');
  const [divisionId, setDivisionId] = useState<number | ''>('');
  const [page, setPage] = useState(1);

  const gradeYears = useMemo(() => [...new Set(divisions.filter((d) => !levelId || d.levelId === levelId).map((d) => d.gradeYear).filter((g): g is number => typeof g === 'number'))].sort((a, b) => a - b), [divisions, levelId]);
  const divisionOptions = useMemo(() => divisions.filter((d) => (!levelId || d.levelId === levelId) && (!gradeYear || d.gradeYear === gradeYear)), [divisions, levelId, gradeYear]);

  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (levelId) params.set('levelId', String(levelId));
  if (gradeYear) params.set('gradeYear', String(gradeYear));
  if (divisionId) params.set('divisionId', String(divisionId));
  const filterKey = params.toString();
  useEffect(() => setPage(1), [filterKey]);

  const list = useQuery({
    queryKey: ['families', filterKey, page],
    queryFn: () => apiGet<Paginated<FamilyRow>>(`/school/announcements/families?${filterKey}&page=${page}&limit=50`),
    placeholderData: (prev) => prev,
  });
  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (id: number) => onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const selectFiltered = async () => {
    const r = await apiGet<{ ids: number[] }>(`/school/announcements/families?${filterKey}&ids=true`);
    onChange([...new Set([...value, ...r.ids])]);
  };
  const unselectFiltered = async () => {
    const r = await apiGet<{ ids: number[] }>(`/school/announcements/families?${filterKey}&ids=true`);
    const drop = new Set(r.ids);
    onChange(value.filter((id) => !drop.has(id)));
  };
  const total = list.data?.pagination.totalItems ?? 0;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="row grow" style={{ position: 'relative', minWidth: 200 }}>
          <Search size={16} className="muted" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
          <input className="input" style={{ paddingLeft: 34, minHeight: 40 }} placeholder="Buscar familia o alumno…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar familias" />
          {search && <button type="button" className="icon-btn" style={{ position: 'absolute', right: 2 }} onClick={() => setSearch('')} aria-label="Limpiar"><X size={14} /></button>}
        </div>
        <select className="select" style={{ minHeight: 40, width: 'auto' }} value={levelId} onChange={(e) => (setLevelId(e.target.value ? Number(e.target.value) : ''), setGradeYear(''), setDivisionId(''))} aria-label="Nivel">
          <option value="">Todos los niveles</option>
          {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="select" style={{ minHeight: 40, width: 'auto' }} value={gradeYear} onChange={(e) => (setGradeYear(e.target.value ? Number(e.target.value) : ''), setDivisionId(''))} aria-label="Grado o año">
          <option value="">Todos los grados/años</option>
          {gradeYears.map((g) => <option key={g} value={g}>{ordinal(g)}</option>)}
        </select>
        <select className="select" style={{ minHeight: 40, width: 'auto' }} value={divisionId} onChange={(e) => setDivisionId(e.target.value ? Number(e.target.value) : '')} aria-label="División">
          <option value="">Todas las divisiones</option>
          {divisionOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        <Badge tone={value.length ? 'info' : undefined}><Users size={12} /> {value.length} {value.length === 1 ? 'familia elegida' : 'familias elegidas'}</Badge>
        <span className="xs muted">{total} {total === 1 ? 'familia coincide' : 'familias coinciden'} con el filtro</span>
        <span className="grow" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={selectFiltered} disabled={!total}><CheckSquare size={14} /> Seleccionar las {total} filtradas</button>
        {value.length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={unselectFiltered}><Square size={14} /> Quitar las filtradas</button>}
        {value.length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange([])}><X size={14} /> Quitar todas</button>}
      </div>

      {list.error && <ErrorBox error={list.error} retry={() => list.refetch()} />}
      {list.isLoading && <Skeleton count={4} h={56} />}
      {list.data && !list.data.data.length && <div className="small muted" style={{ padding: 12 }}>Ninguna familia coincide.</div>}
      {!!list.data?.data.length && (
        <div className="card list" style={{ overflow: 'hidden', maxHeight: 420, overflowY: 'auto' }}>
          {list.data.data.map((f) => {
            const on = selected.has(f.userId);
            return (
              <label key={f.userId} className="list-item" style={{ cursor: 'pointer', alignItems: 'flex-start', background: on ? 'var(--info-bg)' : undefined }}>
                <input type="checkbox" checked={on} onChange={() => toggle(f.userId)} style={{ width: 20, height: 20, marginTop: 10, accentColor: 'var(--primary)' }} aria-label={`${f.firstName} ${f.lastName}`} />
                <Avatar name={`${f.firstName} ${f.lastName}`} src={f.avatar} size="sm" />
                <div className="grow">
                  <div className="h3">{f.lastName}, {f.firstName} {!f.receivesCommunications && <Badge tone="warn">No recibe comunicados</Badge>}</div>
                  <div className="xs muted">
                    {f.students.map((s) => `${s.firstName} ${s.lastName} (${s.relationship}${s.division ? ` · ${s.division.name} · ${s.division.level}` : ''})`).join(' · ')}
                  </div>
                  {(f.email || f.phone) && <div className="xs muted">{[f.email, f.phone].filter(Boolean).join(' · ')}</div>}
                </div>
              </label>
            );
          })}
        </div>
      )}
      {list.data && list.data.pagination.totalPages > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <button type="button" className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span className="xs muted">Página {page} de {list.data.pagination.totalPages}</span>
          <button type="button" className="btn btn-sm btn-ghost" disabled={page >= list.data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  );
};
