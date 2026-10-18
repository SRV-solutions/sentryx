import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { Avatar, Empty, ErrorBox, PageHeader, Skeleton } from '../../ui';

interface Child {
  id: number;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  Enrollments?: Array<{ Division?: { name: string; Level?: { name: string } } }>;
}

export default function FamilyPage() {
  const q = useQuery({ queryKey: ['my-children'], queryFn: () => apiGet<Child[]>('/school/my-children') });
  // Con un solo hijo vamos directo a su ficha: un toque menos en el celular.
  if (q.data?.length === 1) return <Navigate to={`/familia/${q.data[0].id}`} replace />;
  return (
    <div className="stack">
      <PageHeader title="Mis hijos" />
      {q.error && <ErrorBox error={q.error} />}
      {q.isLoading && <Skeleton count={2} h={76} />}
      {q.data && !q.data.length && <Empty title="No hay alumnos vinculados" text="Si es un error, comunicate con la secretaría de la escuela." />}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {q.data?.map((c) => (
          <Link key={c.id} to={`/familia/${c.id}`} className="list-item">
            <Avatar name={`${c.firstName} ${c.lastName}`} src={c.photoUrl} />
            <div className="grow">
              <div className="h3">{c.firstName} {c.lastName}</div>
              <div className="small muted">{c.Enrollments?.[0]?.Division ? `${c.Enrollments[0].Division.name} · ${c.Enrollments[0].Division.Level?.name}` : ''}</div>
            </div>
            <ChevronRight size={18} className="muted" />
          </Link>
        ))}
      </div>
    </div>
  );
}
