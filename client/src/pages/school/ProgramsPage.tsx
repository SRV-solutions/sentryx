import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, Plus, ChevronRight } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Badge, Card, Empty, ErrorBox, PageHeader, Skeleton, fmtDate, useToast } from '../../ui';
import { Entity, Action } from '../../school/permissions';
import { PlanGate } from '../../school/PlanGate';
import { PlanFeature, usePlan } from '../../school/plans';

interface ProgramRow {
  id: number;
  status: 'BORRADOR' | 'PUBLICADO';
  updatedAt: string;
  unitCount: number;
  canEdit: boolean;
  Subject?: { id: number; name: string; Level?: { name: string } };
  Division?: { id: number; name: string } | null;
  Author?: { firstName: string; lastName: string };
}
interface MySubject { subjectId: number; subject?: string; divisionId: number; division?: string; programId: number | null; status: 'BORRADOR' | 'PUBLICADO' | null }

const MySubjects = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const mine = useQuery({ queryKey: ['programs', 'my-subjects'], queryFn: () => apiGet<MySubject[]>('/school/programs/my-subjects') });
  const create = useMutation({
    mutationFn: (s: MySubject) => apiSend<{ id: number }>('POST', '/school/programs', { subjectId: s.subjectId, divisionId: s.divisionId, units: [] }),
    onSuccess: (r) => navigate(`/programas/${r.id}?editar=1`),
    onError: (e: Error) => toast(e.message, true),
  });
  if (!mine.data?.length) return null;
  return (
    <Card>
      <div className="stack" style={{ gap: 8 }}>
        <h2 className="h3">Mis materias</h2>
        {mine.data.map((s) => (
          <div key={`${s.subjectId}-${s.divisionId}`} className="row-between" style={{ gap: 8 }}>
            <span className="small grow truncate"><b>{s.subject}</b> · {s.division}</span>
            {s.programId ? (
              <Link to={`/programas/${s.programId}`} className="btn btn-sm btn-ghost">{s.status === 'PUBLICADO' ? 'Publicado' : 'Borrador'} <ChevronRight size={14} /></Link>
            ) : (
              <button className="btn btn-sm" disabled={create.isPending} onClick={() => create.mutate(s)}><Plus size={14} /> Cargar programa</button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

/** Programas de las materias (plan Integral). */
export default function ProgramsPage() {
  const { can, session } = useSchool();
  const { hasFeature } = usePlan();
  const programs = useQuery({ queryKey: ['programs'], queryFn: () => apiGet<ProgramRow[]>('/school/programs'), enabled: hasFeature(PlanFeature.SUBJECT_PROGRAMS) });
  return (
    <div className="stack-lg">
      <PageHeader title="Programas" subtitle={session?.isStaff ? 'La planificación anual de cada materia, por unidades. Los juegos se enlazan a sus unidades.' : 'Qué van a ver tus hijos en cada materia este año.'} />
      <PlanGate feature={PlanFeature.SUBJECT_PROGRAMS} title="Programas de las materias">
        {can(Entity.SUBJECT_PROGRAMS, Action.CREATE) && <MySubjects />}
        {programs.error && <ErrorBox error={programs.error} />}
        {programs.isLoading && <Skeleton count={4} h={60} />}
        {programs.data && !programs.data.length && <Empty title="Todavía no hay programas" text={session?.isStaff ? 'Cada docente carga el programa de sus materias.' : 'Cuando los docentes publiquen sus programas, los vas a ver acá.'} icon={<BookOpen size={36} strokeWidth={1.5} />} />}
        {!!programs.data?.length && (
          <div className="card list" style={{ overflow: 'hidden' }}>
            {programs.data.map((p) => (
              <Link key={p.id} to={`/programas/${p.id}`} className="list-item">
                <BookOpen size={20} className="muted" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="h3 truncate">{p.Subject?.name}{p.Division ? ` · ${p.Division.name}` : ''}</div>
                  <div className="xs muted truncate">{p.Subject?.Level?.name} · {p.unitCount} unidades · {p.Author?.firstName} {p.Author?.lastName} · {fmtDate(p.updatedAt)}</div>
                </div>
                {session?.isStaff && <Badge tone={p.status === 'PUBLICADO' ? 'ok' : undefined}>{p.status === 'PUBLICADO' ? 'Publicado' : 'Borrador'}</Badge>}
                <ChevronRight size={16} className="muted" />
              </Link>
            ))}
          </div>
        )}
      </PlanGate>
    </div>
  );
}
