import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, ChevronRight, Lock } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Empty, ErrorBox, PageHeader, Skeleton, Tabs, Badge } from '../../ui';
import type { PeriodKind } from '../../school/types';
import { Entity, Action } from '../../school/permissions';

interface SubjectCard {
  id: number;
  division: { id: number; name: string };
  level: { id: number; name: string; type: string };
  subject: { id: number; name: string };
  periods: Array<{ id: number; name: string; kind: PeriodKind; closed: boolean; loaded: number; students: number }>;
}

const KIND_LABEL: Record<PeriodKind, string> = { CONCEPTUAL: 'Conceptual', NUMERIC: 'Numérica', NARRATIVE: 'Informe' };

export default function SubjectsPage() {
  const { session, can } = useSchool();
  const canAll = can(Entity.GRADES, Action.READ);
  const [view, setView] = useState<'mine' | 'all'>(session?.teaching.length ? 'mine' : 'all');
  const q = useQuery({
    queryKey: ['my-subjects', view],
    queryFn: () => apiGet<SubjectCard[]>(`/school/grades/my-subjects${view === 'all' ? '?all=true' : ''}`),
  });

  // Agrupado por división para que el docente con muchas materias se ubique rápido.
  const byDivision = (q.data ?? []).reduce<Record<string, SubjectCard[]>>((acc, s) => {
    const k = `${s.level.name} · ${s.division.name}`;
    (acc[k] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="stack">
      <PageHeader title="Materias" subtitle="Cargá notas y seguí el estado académico de tus cursos." />
      {canAll && session?.teaching.length ? (
        <Tabs value={view} onChange={setView} items={[{ value: 'mine', label: 'Mis materias' }, { value: 'all', label: 'Todas (mi alcance)' }]} />
      ) : null}
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton count={4} h={90} />}
      {q.data && !q.data.length && <Empty title="No tenés materias asignadas" text="Pedile a la dirección que te asigne materias y divisiones." icon={<BookOpenCheck size={36} strokeWidth={1.5} />} />}

      {Object.entries(byDivision).map(([title, subjects]) => (
        <section key={title} className="stack">
          <div className="row-between">
            <h2 className="h2">{title}</h2>
            {canAll && (
              <Link to={`/division/${subjects[0].division.id}`} className="small">Estado académico →</Link>
            )}
          </div>
          <div className="grid grid-auto">
            {subjects.map((s) => {
              const current = s.periods.find((p) => !p.closed && p.loaded < p.students) ?? s.periods.find((p) => !p.closed) ?? s.periods[s.periods.length - 1];
              return (
                <Link key={s.id} to={`/materias/${s.division.id}/${s.subject.id}`} className="card card-link card-pad stack" style={{ gap: 10 }}>
                  <div className="row-between">
                    <div className="h3">{s.subject.name}</div>
                    <ChevronRight size={18} className="muted" />
                  </div>
                  <div className="stack" style={{ gap: 8 }}>
                    {s.periods.map((p) => {
                      const pct = p.students ? Math.round((p.loaded / p.students) * 100) : 0;
                      return (
                        <div key={p.id}>
                          <div className="row-between xs">
                            <span style={{ fontWeight: p.id === current?.id ? 800 : 500 }}>
                              {p.name} <span className="muted">· {KIND_LABEL[p.kind]}</span> {p.closed && <Lock size={11} />}
                            </span>
                            <span className="muted">{p.loaded}/{p.students || '—'}</span>
                          </div>
                          <div className="progress" style={{ marginTop: 4 }}><span style={{ width: `${pct}%`, background: pct === 100 ? 'var(--ok)' : undefined }} /></div>
                        </div>
                      );
                    })}
                  </div>
                  {current && !current.closed && current.loaded < current.students && <Badge tone="warn">Faltan {current.students - current.loaded} notas en {current.name}</Badge>}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
