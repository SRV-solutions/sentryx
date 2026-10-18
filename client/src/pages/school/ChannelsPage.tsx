import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Hash, ShieldCheck } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Empty, ErrorBox, PageHeader, Skeleton, timeAgo } from '../../ui';

export interface ChannelRow {
  id: number;
  name: string;
  subjectId: number | null;
  division: { id: number; name: string };
  role: 'member' | 'moderator';
  unread: number;
  last: { body: string; createdAt: string; sender: string; hidden: boolean } | null;
}

/** Canales de curso (Secundario): General de la división + uno por materia. */
export default function ChannelsPage() {
  const { session } = useSchool();
  const q = useQuery({ queryKey: ['channels'], queryFn: () => apiGet<ChannelRow[]>('/school/channels') });
  const student = !!session?.self && !session.isStaff;
  const groups = new Map<number, { name: string; items: ChannelRow[] }>();
  for (const c of q.data ?? []) {
    const g = groups.get(c.division.id) ?? { name: c.division.name, items: [] };
    g.items.push(c);
    groups.set(c.division.id, g);
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Canales"
        subtitle={student ? 'Hablá con tu curso y tus docentes. Los docentes y preceptoría leen los canales.' : 'Canales de los cursos de Secundario. Podés moderar: ocultar mensajes y silenciar temporalmente.'}
      />
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton count={6} h={64} />}
      {q.data && !q.data.length && (
        <Empty title="Sin canales" text="Los canales de curso existen en Secundario, para estudiantes con cuenta y sus docentes." icon={<Hash size={36} strokeWidth={1.5} />} />
      )}
      {[...groups.entries()].map(([id, g]) => (
        <section key={id} className="stack" style={{ gap: 8 }}>
          {groups.size > 1 && <h2 className="h3">{g.name}</h2>}
          <div className="card list" style={{ overflow: 'hidden' }}>
            {g.items.map((c) => (
              <Link key={c.id} to={`/canales/${c.id}`} className={`list-item ${c.unread ? 'unread' : ''}`}>
                <span className="avatar avatar-sm" style={{ background: c.subjectId ? 'var(--surface-2)' : 'var(--info-bg)' }}><Hash size={16} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row-between">
                    <span className="h3 truncate">{c.subjectId ? c.name.split(' · ')[0] : 'General'}</span>
                    {c.last && <span className="xs muted" style={{ flexShrink: 0 }}>{timeAgo(c.last.createdAt)}</span>}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="small muted truncate grow" style={{ fontStyle: c.last?.hidden ? 'italic' : undefined, fontWeight: c.unread ? 700 : 400 }}>
                      {c.last ? `${c.last.sender}: ${c.last.body}` : 'Todavía no hay mensajes'}
                    </span>
                    {c.role === 'moderator' && <ShieldCheck size={14} className="muted" aria-label="Moderás este canal" />}
                    {c.unread > 0 && <span className="count">{c.unread}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
