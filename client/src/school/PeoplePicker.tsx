import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Avatar, Badge, ErrorBox, Skeleton } from '../ui';
import { PickedChips, useDebounced, type Picked } from './announcements';

/** GET /announcements/people: personas a las que quien escribe puede mandarle un comunicado. */
export interface PersonHit { userId: number; name: string; avatar: string | null; kind: 'STAFF' | 'FAMILY' | 'STUDENT'; detail: string | null }

const KIND_LABELS: Record<PersonHit['kind'], string> = { STAFF: 'Personal', FAMILY: 'Familia', STUDENT: 'Estudiante' };
const KIND_TONES: Record<PersonHit['kind'], 'info' | 'ok' | 'warn'> = { STAFF: 'info', FAMILY: 'ok', STUDENT: 'warn' };

interface Props {
  value: Picked[];
  onChange: (v: Picked[]) => void;
  /** userIds que no se ofrecen (ej: ya están en la audiencia principal). */
  exclude?: number[];
  autoFocus?: boolean;
}

/**
 * Colegas, familias o estudiantes elegidos uno por uno ("Personas" y "Sumar más gente"). El servidor
 * ya recorta al alcance de quien escribe y vuelve a validar al enviar.
 */
export const PeoplePicker = ({ value, onChange, exclude = [], autoFocus }: Props) => {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<PersonHit['kind'] | ''>('');
  const q = useDebounced(search.trim());
  const list = useQuery({
    queryKey: ['announcement-people', q],
    queryFn: () => apiGet<PersonHit[]>(`/school/announcements/people?q=${encodeURIComponent(q)}&limit=30`),
    enabled: q.length >= 2,
    placeholderData: (prev) => prev,
  });
  const selected = useMemo(() => new Set(value.map((v) => v.id)), [value]);
  const hidden = useMemo(() => new Set(exclude), [exclude]);
  const rows = q.length >= 2 ? (list.data ?? []).filter((p) => !hidden.has(p.userId) && (!kind || p.kind === kind)) : [];
  const toggle = (p: PersonHit) => onChange(selected.has(p.userId) ? value.filter((v) => v.id !== p.userId) : [...value, { id: p.userId, name: p.name, detail: p.detail }]);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <PickedChips items={value} onRemove={(id) => onChange(value.filter((v) => v.id !== id))} />
      <div className="row" style={{ position: 'relative' }}>
        <Search size={16} className="muted" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
        <input className="input" style={{ paddingLeft: 34, minHeight: 40 }} placeholder="Buscar por nombre: colegas, familias o estudiantes…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar personas" autoFocus={autoFocus} />
        {search && <button type="button" className="icon-btn" style={{ position: 'absolute', right: 2 }} onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><X size={14} /></button>}
      </div>
      <div className="chips" role="group" aria-label="Filtrar por tipo de persona">
        {([['', 'Todos'], ['STAFF', 'Personal'], ['FAMILY', 'Familias'], ['STUDENT', 'Estudiantes']] as const).map(([k, label]) => (
          <button type="button" key={k || 'all'} className={`chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{label}</button>
        ))}
      </div>

      {q.length < 2 && <div className="xs muted">Escribí al menos 2 letras del nombre.</div>}
      {list.error && <ErrorBox error={list.error} retry={() => list.refetch()} />}
      {q.length >= 2 && list.isLoading && <Skeleton count={3} h={52} />}
      {q.length >= 2 && list.data && !rows.length && <div className="small muted" style={{ padding: 8 }}>Nadie coincide con la búsqueda.</div>}
      {rows.length > 0 && (
        <div className="card list" style={{ overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
          {rows.map((p) => {
            const on = selected.has(p.userId);
            return (
              <label key={p.userId} className="list-item" style={{ cursor: 'pointer', background: on ? 'var(--info-bg)' : undefined }}>
                <input type="checkbox" checked={on} onChange={() => toggle(p)} style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} aria-label={p.name} />
                <Avatar name={p.name} src={p.avatar} size="sm" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="h3 truncate">{p.name}</div>
                  {p.detail && <div className="xs muted truncate">{p.detail}</div>}
                </div>
                <Badge tone={KIND_TONES[p.kind]}>{KIND_LABELS[p.kind]}</Badge>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};
