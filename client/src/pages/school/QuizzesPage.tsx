import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Play, ClipboardList, BarChart3, Pencil, Gamepad2, Trophy, Clock } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Badge, Card, Empty, ErrorBox, Field, PageHeader, Sheet, Skeleton, fmtDate, useToast } from '../../ui';
import { Entity, Action } from '../../school/permissions';
import { PlanGate } from '../../school/PlanGate';
import { PlanFeature } from '../../school/plans';
import type { Quiz } from '../../school/quiz';
import type { Structure } from '../../school/types';

interface MyAssignment { id: number; title: string; subject: string | null; questionCount: number; closesAt: string; open: boolean; attempt: { score: number; correctCount: number; questionCount: number } | null }
interface AssignmentRow { id: number; closesAt: string; attempts: number; Division?: { name: string } }

/** Asignar como tarea a un curso donde dicta. */
const AssignSheet = ({ quiz, onClose }: { quiz: Quiz | null; onClose: () => void }) => {
  const toast = useToast();
  const { session } = useSchool();
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const teaching = new Set(session?.teaching.map((t) => t.divisionId));
  const divisions = structure.data?.divisions.filter((d) => teaching.has(d.id) || session?.scope.all) ?? [];
  const tomorrow = new Date(Date.now() + 2 * 86_400_000);
  const [divisionId, setDivisionId] = useState<number | ''>('');
  const [closesAt, setClosesAt] = useState(`${tomorrow.toISOString().slice(0, 10)}T23:59`);
  const [showAnswers, setShowAnswers] = useState(true);
  const assign = useMutation({
    mutationFn: () => apiSend('POST', `/school/quizzes/${quiz!.id}/assignments`, { divisionId, closesAt: new Date(closesAt).toISOString(), showAnswers }),
    onSuccess: () => (toast('Asignado: les avisamos a los estudiantes con cuenta'), onClose()),
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <Sheet open={!!quiz} onClose={onClose} title={`Asignar como tarea: ${quiz?.title ?? ''}`}>
      <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), assign.mutate())}>
        <Field label="Curso">
          <select className="select" required value={divisionId} onChange={(e) => setDivisionId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Elegí un curso</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{structure.data?.levels.find((l) => l.id === d.levelId)?.name} · {d.name}</option>)}
          </select>
        </Field>
        <Field label="Se puede responder hasta"><input className="input" type="datetime-local" required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></Field>
        <label className="row small"><input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} /> Al terminar, mostrarles las respuestas correctas</label>
        <p className="xs muted">Lo responden los estudiantes con cuenta propia (Secundario), una sola vez. Para jugar con todo el curso en el aula, usá "En vivo".</p>
        <button className="btn btn-block" disabled={!divisionId || assign.isPending}>{assign.isPending ? 'Asignando…' : 'Asignar'}</button>
      </form>
    </Sheet>
  );
};

const AssignmentsSheet = ({ quiz, onClose }: { quiz: Quiz | null; onClose: () => void }) => {
  const list = useQuery({ queryKey: ['quiz-assignments', quiz?.id], queryFn: () => apiGet<AssignmentRow[]>(`/school/quizzes/${quiz!.id}/assignments`), enabled: !!quiz });
  return (
    <Sheet open={!!quiz} onClose={onClose} title={`Tareas: ${quiz?.title ?? ''}`}>
      {list.isLoading && <Skeleton count={2} h={50} />}
      {list.data && !list.data.length && <Empty title="Todavía no lo asignaste como tarea" />}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {list.data?.map((a) => (
          <Link key={a.id} to={`/juegos/resultados/${a.id}`} className="list-item" onClick={onClose}>
            <div className="grow">
              <div className="h3">{a.Division?.name}</div>
              <div className="xs muted">Cierra {fmtDate(a.closesAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {a.attempts} respondieron</div>
            </div>
            <BarChart3 size={18} />
          </Link>
        ))}
      </div>
    </Sheet>
  );
};

const TeacherQuizzes = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const quizzes = useQuery({ queryKey: ['quizzes'], queryFn: () => apiGet<Quiz[]>('/school/quizzes') });
  const [assigning, setAssigning] = useState<Quiz | null>(null);
  const [results, setResults] = useState<Quiz | null>(null);
  const live = useMutation({
    mutationFn: (id: number) => apiSend<{ id: number; pin: string }>('POST', `/school/quizzes/${id}/live`),
    onSuccess: (r) => navigate(`/juegos/en-vivo/${r.id}`),
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <div className="stack">
      {quizzes.error && <ErrorBox error={quizzes.error} />}
      {quizzes.isLoading && <Skeleton count={3} h={90} />}
      {quizzes.data && !quizzes.data.length && (
        <Empty title="Creá tu primer juego" text="Preguntas de opción múltiple con tiempo, enlazadas a una unidad de tu programa. Se juegan en vivo en el aula o como tarea." icon={<Gamepad2 size={36} strokeWidth={1.5} />} action={<Link to="/juegos/nuevo" className="btn"><Plus size={16} /> Nuevo juego</Link>} />
      )}
      <div className="grid grid-auto">
        {quizzes.data?.map((q) => (
          <Card key={q.id}>
            <div className="stack" style={{ gap: 8 }}>
              <div>
                <div className="h3">{q.title}</div>
                <div className="xs muted">{q.questionCount} preguntas{q.Subject ? ` · ${q.Subject.name}` : ''}{q.ProgramUnit ? ` · Unidad ${q.ProgramUnit.order}: ${q.ProgramUnit.title}` : ''}</div>
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-accent" disabled={live.isPending || !q.questionCount} onClick={() => live.mutate(q.id)}><Play size={14} /> En vivo</button>
                <button className="btn btn-sm" disabled={!q.questionCount} onClick={() => setAssigning(q)}><ClipboardList size={14} /> Como tarea</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setResults(q)}><BarChart3 size={14} /> Resultados</button>
                <Link to={`/juegos/${q.id}`} className="btn btn-sm btn-ghost"><Pencil size={14} /> Editar</Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <AssignSheet quiz={assigning} onClose={() => setAssigning(null)} />
      <AssignmentsSheet quiz={results} onClose={() => setResults(null)} />
    </div>
  );
};

const StudentQuizzes = () => {
  const list = useQuery({ queryKey: ['quiz-assignments', 'mine'], queryFn: () => apiGet<MyAssignment[]>('/school/quiz-assignments/mine') });
  if (list.isLoading) return <Skeleton count={3} h={70} />;
  if (!list.data?.length) return <Empty title="No tenés juegos pendientes" text="Cuando un docente te asigne uno, aparece acá." icon={<Gamepad2 size={36} strokeWidth={1.5} />} />;
  return (
    <div className="card list" style={{ overflow: 'hidden' }}>
      {list.data.map((a) => (
        <Link key={a.id} to={`/juegos/tarea/${a.id}`} className="list-item">
          <Gamepad2 size={20} className="accent" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="h3 truncate">{a.title}</div>
            <div className="xs muted">{a.subject ? `${a.subject} · ` : ''}{a.questionCount} preguntas · {a.open ? 'cierra' : 'cerró'} {fmtDate(a.closesAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          {a.attempt ? <Badge tone="ok"><Trophy size={12} /> {a.attempt.score} pts</Badge> : a.open ? <Badge tone="accent">Jugar</Badge> : <Badge><Clock size={12} /> Cerrado</Badge>}
        </Link>
      ))}
    </div>
  );
};

/** Juegos de preguntas: el docente los crea (plan Integral); el estudiante responde los que le asignan. */
export default function QuizzesPage() {
  const { can, session } = useSchool();
  const teacher = can(Entity.QUIZZES, Action.CREATE);
  return (
    <div className="stack-lg">
      <PageHeader
        title="Juegos"
        subtitle={teacher ? 'Preguntas con tiempo, en vivo con PIN o como tarea.' : 'Juegos de tus docentes.'}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <Link to="/jugar" className="btn btn-ghost"><Play size={16} /> <span className="hide-mobile">Entrar con PIN</span></Link>
            {teacher && <Link to="/juegos/nuevo" className="btn"><Plus size={18} /> Nuevo</Link>}
          </div>
        }
      />
      {teacher ? (
        <PlanGate feature={PlanFeature.QUIZZES} title="Juegos de preguntas">
          <TeacherQuizzes />
        </PlanGate>
      ) : session?.self ? (
        <StudentQuizzes />
      ) : (
        <Empty title="Los juegos los crean los docentes" />
      )}
    </div>
  );
}
