import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSchool } from '../../school/SchoolContext';
import { CredentialsSheet, type Credential } from '../../school/CredentialsSheet';
import { useToast } from '../../ui';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search, ChevronRight, BarChart3, KeySquare, ArrowRightLeft, CheckSquare } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { Avatar, Badge, Empty, ErrorBox, PageHeader, Skeleton } from '../../ui';
import { TransferSheet } from '../../school/StudentLifecycle';
import type { Paginated, Structure } from '../../school/types';
import { Entity, Action } from '../../school/permissions';

interface Row { id: number; firstName: string; lastName: string; dni: string | null; photoUrl: string | null; active?: boolean; leftAt?: string | null; Enrollments?: Array<{ Division?: { id: number; name: string } }> }

export default function StudentsPage() {
  const [q, setQ] = useState('');
  const [divisionId, setDivisionId] = useState<number | ''>('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  // Selección múltiple para cambiar de curso a varios alumnos a la vez.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [transferring, setTransferring] = useState(false);
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const list = useInfiniteQuery({
    queryKey: ['students', q, divisionId, status],
    queryFn: ({ pageParam }) =>
      apiGet<Paginated<Row>>(`/school/students?page=${pageParam}&limit=30${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ''}${divisionId ? `&divisionId=${divisionId}` : ''}${status === 'inactive' ? '&status=inactive' : ''}`),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.pagination.currentPage < l.pagination.totalPages ? l.pagination.currentPage + 1 : undefined),
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const levelName = (id: number) => structure.data?.levels.find((l) => l.id === id)?.name ?? '';
  const { can } = useSchool();
  const toast = useToast();
  const qc = useQueryClient();
  const [creds, setCreds] = useState<Credential[]>([]);
  const selected = structure.data?.divisions.find((d) => d.id === divisionId);
  const isSecondary = !!selected && structure.data?.levels.find((l) => l.id === selected.levelId)?.type === 'SECUNDARIO';
  const bulk = useMutation({
    mutationFn: () => apiSend<{ created: number; skipped: number; errors: Array<{ student: string; message: string }>; credentials: Credential[] }>('POST', '/school/students/accounts', { divisionId }),
    onSuccess: (r) => {
      toast(`${r.created} cuentas creadas${r.skipped ? ` · ${r.skipped} ya tenían` : ''}${r.errors.length ? ` · ${r.errors.length} con error: ${r.errors.map((e) => e.student).join(', ')}` : ''}`, r.errors.length > 0);
      setCreds(r.credentials);
      qc.invalidateQueries({ queryKey: ['student'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

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
        {can(Entity.USERS, Action.UPDATE) && (
          <select className="select" style={{ flex: '0 1 160px' }} value={status} onChange={(e) => (setStatus(e.target.value as 'active' | 'inactive'), setSelecting(false), setSelectedIds([]))}>
            <option value="active">Activos</option>
            <option value="inactive">Dados de baja</option>
          </select>
        )}
        {status === 'active' && can(Entity.USERS, Action.UPDATE) && (
          <button className={`btn ${selecting ? '' : 'btn-ghost'}`} onClick={() => (setSelecting(!selecting), setSelectedIds([]))}><CheckSquare size={16} /> {selecting ? 'Cancelar selección' : 'Seleccionar'}</button>
        )}
        {divisionId && (
          <Link to={`/division/${divisionId}`} className="btn btn-ghost"><BarChart3 size={16} /> Estado de la división</Link>
        )}
        {isSecondary && can(Entity.USERS, Action.UPDATE) && (
          <button className="btn btn-ghost" onClick={() => bulk.mutate()} disabled={bulk.isPending}><KeySquare size={16} /> {bulk.isPending ? 'Creando…' : 'Crear cuentas de estudiantes'}</button>
        )}
      </div>
      {selecting && (
        <div className="row-between wrap card" style={{ padding: '10px 14px' }}>
          <span className="small">{selectedIds.length} seleccionados</span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelectedIds(rows.map((r) => r.id))}>Todos los visibles</button>
            <button className="btn btn-sm" disabled={!selectedIds.length} onClick={() => setTransferring(true)}><ArrowRightLeft size={16} /> Cambiar de curso</button>
          </div>
        </div>
      )}
      {list.error && <ErrorBox error={list.error} />}
      {list.isLoading && <Skeleton count={8} h={56} />}
      {!list.isLoading && !rows.length && <Empty title="No se encontraron alumnos" />}
      {rows.length > 0 && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {rows.map((s) => selecting ? (
            <label key={s.id} className="list-item" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={(e) => setSelectedIds(e.target.checked ? [...selectedIds, s.id] : selectedIds.filter((x) => x !== s.id))} />
              <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photoUrl} size="sm" />
              <div className="grow">
                <div className="h3 truncate">{s.lastName}, {s.firstName}</div>
                <div className="xs muted">{s.Enrollments?.[0]?.Division?.name ?? 'Sin división'}</div>
              </div>
            </label>
          ) : (
            <Link key={s.id} to={`/alumnos/${s.id}`} className="list-item">
              <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photoUrl} size="sm" />
              <div className="grow">
                <div className="h3 truncate">{s.lastName}, {s.firstName}</div>
                <div className="xs muted">{s.Enrollments?.[0]?.Division?.name ?? 'Sin división'}{s.dni && ` · DNI ${s.dni}`}</div>
              </div>
              {s.active === false && <Badge tone="danger">Baja{s.leftAt ? ` ${s.leftAt.slice(0, 10).split('-').reverse().join('/')}` : ''}</Badge>}
              <ChevronRight size={16} className="muted" />
            </Link>
          ))}
        </div>
      )}
      {list.hasNextPage && <button className="btn btn-ghost" onClick={() => list.fetchNextPage()}>Ver más</button>}
      <TransferSheet open={transferring} onClose={() => setTransferring(false)} studentIds={selectedIds} title={`Cambiar de curso (${selectedIds.length})`} onDone={() => (setSelecting(false), setSelectedIds([]))} />
      <CredentialsSheet items={creds} onClose={() => setCreds([])} title="Cuentas de estudiantes" />
    </div>
  );
}
