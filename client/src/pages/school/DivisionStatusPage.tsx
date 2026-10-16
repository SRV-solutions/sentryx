import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { Avatar, Badge, ErrorBox, PageHeader, Skeleton, fullName, Chips } from '../../ui';
import { useState } from 'react';
import type { PersonLite } from '../../school/types';

interface Status {
  division: { id: number; name: string };
  students: Array<{ student: PersonLite; average: number | null; subjectsAtRisk: string[]; status: 'OK' | 'WARNING' | 'CRITICAL' }>;
}
interface AttSummary { studentId: number; days: number; total: number; unjustified: number; percent: number }

/** Estado académico + asistencia de una división, de un vistazo (docentes, preceptoría, conducción). */
export default function DivisionStatusPage() {
  const id = Number(useParams().id);
  const [filter, setFilter] = useState<'all' | 'risk'>('all');
  const status = useQuery({ queryKey: ['division-status', id], queryFn: () => apiGet<Status>(`/school/grades/division-status/${id}`) });
  const att = useQuery({ queryKey: ['att-summary', id], queryFn: () => apiGet<AttSummary[]>(`/school/attendance/summary/${id}`) });
  if (status.error) return <ErrorBox error={status.error} />;
  if (!status.data) return <Skeleton count={6} h={60} />;
  const attBy = new Map(att.data?.map((a) => [a.studentId, a]));
  const list = status.data.students.filter((s) => filter === 'all' || s.status !== 'OK');
  return (
    <div className="stack">
      <Link to="/materias" className="row small muted"><ArrowLeft size={16} /> Materias</Link>
      <PageHeader title={`Estado académico · ${status.data.division.name}`} subtitle="Última valoración de cada materia y asistencia del ciclo." />
      <Chips value={filter} onChange={setFilter} items={[{ value: 'all', label: `Todos (${status.data.students.length})` }, { value: 'risk', label: `En riesgo (${status.data.students.filter((s) => s.status !== 'OK').length})` }]} />
      <div className="card list" style={{ overflow: 'hidden' }}>
        {list.map((s) => {
          const a = attBy.get(s.student.id);
          return (
            <Link key={s.student.id} to={`/alumnos/${s.student.id}`} className="list-item" style={{ alignItems: 'flex-start' }}>
              <Avatar name={fullName(s.student)} size="sm" />
              <div className="grow">
                <div className="h3">{s.student.lastName}, {s.student.firstName}</div>
                {s.subjectsAtRisk.length > 0 && <div className="xs" style={{ color: 'var(--danger)' }}>En riesgo: {s.subjectsAtRisk.join(', ')}</div>}
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  {s.average !== null && <Badge>Promedio {s.average}</Badge>}
                  {a && <Badge tone={a.percent < 85 ? 'warn' : undefined}>Asistencia {a.percent}% · {a.total} faltas</Badge>}
                </div>
              </div>
              <Badge tone={s.status === 'CRITICAL' ? 'danger' : s.status === 'WARNING' ? 'warn' : 'ok'}>
                {s.status === 'CRITICAL' ? 'Crítico' : s.status === 'WARNING' ? 'Atención' : 'Bien'}
              </Badge>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
