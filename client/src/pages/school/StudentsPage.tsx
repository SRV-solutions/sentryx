import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search, ChevronRight, BarChart3 } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { Avatar, Empty, ErrorBox, PageHeader, Skeleton } from '../../ui';
import type { Paginated, Structure } from '../../school/types';

interface Row { id: number; firstName: string; lastName: string; dni: string | null; photoUrl: string | null; Enrollments?: Array<{ Division?: { id: number; name: string } }> }

export default function StudentsPage() {
  const [q, setQ] = useState('');
  const [divisionId, setDivisionId] = useState<number | ''>('');
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const list = useInfiniteQuery({
    queryKey: ['students', q, divisionId],
    queryFn: ({ pageParam }) =>
      apiGet<Paginated<Row>>(`/school/students?page=${pageParam}&limit=30${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ''}${divisionId ? `&divisionId=${divisionId}` : ''}`),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.pagination.currentPage < l.pagination.totalPages ? l.pagination.currentPage + 1 : undefined),
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const levelName = (id: number) => structure.data?.levels.find((l) => l.id === id)?.name ?? '';

  return (
    <div className="stack">
      <PageHeader title="Alumnos" subtitle={`${list.data?.pages[0]?.pagination.totalItems ?? '…'} en tu alcance`} />
      <div className="row wrap">
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 14 }} className="muted" />
          <input className="input" style={{ paddingLeft: 42 }} placeholder="Buscar por nombre o DNI" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" style={{ flex: '1 1 160px' }} value={divisionId} onChange={(e) => setDivisionId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Todas las divisiones</option>
          {structure.data?.divisions.map((d) => (
            <option key={d.id} value={d.id}>{levelName(d.levelId)} · {d.name}</option>
          ))}
        </select>
        {divisionId && (
          <Link to={`/division/${divisionId}`} className="btn btn-ghost"><BarChart3 size={16} /> Estado de la división</Link>
        )}
      </div>
      {list.error && <ErrorBox error={list.error} />}
      {list.isLoading && <Skeleton count={8} h={56} />}
      {!list.isLoading && !rows.length && <Empty title="No se encontraron alumnos" />}
      {rows.length > 0 && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {rows.map((s) => (
            <Link key={s.id} to={`/alumnos/${s.id}`} className="list-item">
              <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photoUrl} size="sm" />
              <div className="grow">
                <div className="h3 truncate">{s.lastName}, {s.firstName}</div>
                <div className="xs muted">{s.Enrollments?.[0]?.Division?.name ?? 'Sin división'}{s.dni && ` · DNI ${s.dni}`}</div>
              </div>
              <ChevronRight size={16} className="muted" />
            </Link>
          ))}
        </div>
      )}
      {list.hasNextPage && <button className="btn btn-ghost" onClick={() => list.fetchNextPage()}>Ver más</button>}
    </div>
  );
}
