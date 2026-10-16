import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { School, Users, GraduationCap, ChevronRight } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { Badge, Empty, ErrorBox, PageHeader, Skeleton, timeAgo } from '../../ui';

export interface ClassroomRow {
  id: number;
  name: string;
  shift: string | null;
  studentCount: string;
  teacherCount: string;
  lastPostAt: string | null;
  recentPosts: string;
  Level: { id: number; name: string; type: string };
  mySubjects: string[];
  myChildren: string[];
}

const LEVEL_COLORS: Record<string, string> = { INICIAL: '#F6950A', PRIMARIO: '#0B78FB', SECUNDARIO: '#8B5CF6' };

/** Aulas: cada curso/división con sus docentes, alumnos, materiales, tareas y comunicados. */
export default function ClassroomsPage() {
  const q = useQuery({ queryKey: ['classrooms'], queryFn: () => apiGet<ClassroomRow[]>('/school/classrooms') });

  const byLevel = (q.data ?? []).reduce<Record<string, ClassroomRow[]>>((acc, c) => ((acc[c.Level.name] ??= []).push(c), acc), {});

  return (
    <div className="stack">
      <PageHeader title="Aulas" subtitle="Materiales, tareas y comunicados de cada curso." />
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton count={4} h={96} />}
      {q.data && !q.data.length && <Empty title="No tenés aulas" text="Cuando te asignen materias o tengas hijos inscriptos, vas a ver sus aulas acá." icon={<School size={36} strokeWidth={1.5} />} />}
      {Object.entries(byLevel).map(([level, rooms]) => (
        <section key={level} className="stack">
          {Object.keys(byLevel).length > 1 && <h2 className="h2">{level}</h2>}
          <div className="grid grid-auto">
            {rooms.map((c) => (
              <Link key={c.id} to={`/aulas/${c.id}`} className="card card-link" style={{ overflow: 'hidden' }}>
                <div style={{ height: 6, background: LEVEL_COLORS[c.Level.type] ?? 'var(--primary)' }} />
                <div className="card-pad stack" style={{ gap: 8 }}>
                  <div className="row-between">
                    <div>
                      <div className="h2">{c.name}</div>
                      <div className="xs muted">{c.Level.name}{c.shift ? ` · Turno ${c.shift}` : ''}</div>
                    </div>
                    <ChevronRight size={18} className="muted" />
                  </div>
                  {c.mySubjects.length > 0 && <div className="small"><b>Tus materias:</b> {c.mySubjects.join(', ')}</div>}
                  {c.myChildren.length > 0 && <div className="small"><b>{c.myChildren.join(' y ')}</b> cursa acá</div>}
                  <div className="row wrap" style={{ gap: 6 }}>
                    <Badge><GraduationCap size={12} /> {c.studentCount} alumnos</Badge>
                    <Badge><Users size={12} /> {c.teacherCount} docentes</Badge>
                    {Number(c.recentPosts) > 0 && <Badge tone="accent">{c.recentPosts} nuevas esta semana</Badge>}
                  </div>
                  {c.lastPostAt && <div className="xs muted">Última publicación {timeAgo(c.lastPostAt)}</div>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
