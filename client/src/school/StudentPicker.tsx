import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, CheckSquare, GraduationCap } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Avatar, Badge, ErrorBox, Skeleton } from '../ui';
import type { Paginated } from './types';
import { PickedChips, useDebounced, type Picked } from './announcements';

interface StudentHit {
  id: number;
  firstName: string;
  lastName: string;
  dni: string | null;
  photoUrl: string | null;
  Enrollments?: Array<{ Division?: { id: number; name: string; levelId: number } }>;
}

interface Props {
  value: Picked[];
  onChange: (v: Picked[]) => void;
  divisions: Array<{ id: number; name: string; levelId: number }>;
}

/**
 * Alumnos elegidos uno por uno (comunicado a un alumno puntual o a unos pocos). Busca por nombre o DNI
 * dentro del alcance de quien escribe (GET /students ya lo recorta) y se puede filtrar por curso: con un
 * curso elegido y sin texto, lista todo el curso para tildar.
 */
export const StudentPicker = ({ value, onChange, divisions }: Props) => {
  const [search, setSearch] = useState('');
  const [divisionId, setDivisionId] = useState<number | ''>('');
  const q = useDebounced(search.trim());
  const enabled = q.length >= 2 || !!divisionId;
  const params = new URLSearchParams({ limit: '60' });
  if (q.length >= 2) params.set('q', q);
  if (divisionId) params.set('divisionId', String(divisionId));
  const list = useQuery({
    queryKey: ['students-pick', params.toString()],
    queryFn: () => apiGet<Paginated<StudentHit>>(`/school/students?${params}`),
    enabled,
    placeholderData: (prev) => prev,
  });
  const selected = useMemo(() => new Set(value.map((v) => v.id)), [value]);
  const divisionName = (s: StudentHit) => s.Enrollments?.[0]?.Division?.name ?? null;
  const toPick = (s: StudentHit): Picked => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, detail: divisionName(s) });
  const toggle = (s: StudentHit) => onChange(selected.has(s.id) ? value.filter((v) => v.id !== s.id) : [...value, toPick(s)]);
  const rows = enabled ? list.data?.data ?? [] : [];
  const unpicked = rows.filter((s) => !selected.has(s.id));

  return (
    <div className="stack" style={{ gap: 10 }}>
      <PickedChips items={value.map((v) => ({ ...v, name: v.name && v.detail ? `${v.name} · ${v.detail}` : v.name }))} fallback="Alumno elegido" onRemove={(id) => onChange(value.filter((v) => v.id !== id))} />
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="row grow" style={{ position: 'relative', minWidth: 200 }}>
          <Search size={16} className="muted" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
          <input className="input" style={{ paddingLeft: 34, minHeight: 40 }} placeholder="Buscar alumno por nombre o DNI…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar alumnos" />
          {search && <button type="button" className="icon-btn" style={{ position: 'absolute', right: 2 }} onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><X size={14} /></button>}
        </div>
        <select className="select" style={{ minHeight: 40, width: 'auto' }} value={divisionId} onChange={(e) => setDivisionId(e.target.value ? Number(e.target.value) : '')} aria-label="Curso">
          <option value="">Todos los cursos</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {!enabled && <div className="xs muted">Escribí al menos 2 letras o elegí un curso para ver sus alumnos.</div>}
      {list.error && <ErrorBox error={list.error} retry={() => list.refetch()} />}
      {enabled && list.isLoading && <Skeleton count={3} h={52} />}
      {enabled && list.data && !rows.length && <div className="small muted" style={{ padding: 8 }}>Ningún alumno coincide.</div>}
      {rows.length > 0 && (
        <>
          <div className="row wrap" style={{ gap: 8 }}>
            <Badge tone={value.length ? 'info' : undefined}><GraduationCap size={12} /> {value.length} {value.length === 1 ? 'alumno elegido' : 'alumnos elegidos'}</Badge>
            <span className="grow" />
            {unpicked.length > 1 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange([...value, ...unpicked.map(toPick)])}><CheckSquare size={14} /> Elegir los {unpicked.length} de la lista</button>
            )}
          </div>
          <div className="card list" style={{ overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
            {rows.map((s) => {
              const on = selected.has(s.id);
              return (
                <label key={s.id} className="list-item" style={{ cursor: 'pointer', background: on ? 'var(--info-bg)' : undefined }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(s)} style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} aria-label={`${s.firstName} ${s.lastName}`} />
                  <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photoUrl} size="sm" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="h3 truncate">{s.lastName}, {s.firstName}</div>
                    <div className="xs muted truncate">{[divisionName(s), s.dni && `DNI ${s.dni}`].filter(Boolean).join(' · ')}</div>
                  </div>
                </label>
              );
            })}
          </div>
          {(list.data?.pagination.totalItems ?? 0) > rows.length && <div className="xs muted">Se muestran {rows.length} de {list.data!.pagination.totalItems}. Afiná la búsqueda para ver el resto.</div>}
        </>
      )}
    </div>
  );
};
