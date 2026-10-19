import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { Badge, Card, ErrorBox, PageHeader, Skeleton, fmtDate } from '../../ui';

interface Results {
  assignment: { id: number; closesAt: string; division: { name: string }; quiz: { id: number; title: string } };
  students: Array<{ id: number; firstName: string; lastName: string; hasAccount: boolean; score: number | null; correctCount: number | null; finishedAt: string | null }>;
  questions: Array<{ id: string; text: string; answered: number; correct: number }>;
}

/** Docente: resultados de un juego asignado como tarea. */
export default function QuizResultsPage() {
  const id = Number(useParams().id);
  const data = useQuery({ queryKey: ['quiz-results', id], queryFn: () => apiGet<Results>(`/school/quiz-assignments/${id}/results`) });
  const r = data.data;
  const done = r?.students.filter((s) => s.score !== null) ?? [];
  const ranked = [...(r?.students ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return (
    <div className="stack-lg">
      <Link to="/juegos" className="row small muted"><ArrowLeft size={16} /> Juegos</Link>
      {data.error && <ErrorBox error={data.error} />}
      {!r && !data.error && <Skeleton count={3} h={80} />}
      {r && (
        <>
          <PageHeader title={r.assignment.quiz.title} subtitle={`${r.assignment.division.name} · ${done.length} de ${r.students.length} respondieron · cierra ${fmtDate(r.assignment.closesAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`} />
          <Card>
            <div className="stack" style={{ gap: 10 }}>
              <h2 className="h3">Por pregunta</h2>
              {r.questions.map((q, i) => {
                const pct = q.answered ? Math.round((q.correct / q.answered) * 100) : 0;
                return (
                  <div key={q.id} className="stack" style={{ gap: 4 }}>
                    <div className="row-between small"><span className="truncate">{i + 1}. {q.text}</span><b style={{ color: pct < 50 ? 'var(--danger)' : undefined }}>{q.answered ? `${pct}%` : '—'}</b></div>
                    <div className="progress"><span style={{ width: `${pct}%`, background: pct < 50 ? 'var(--danger)' : 'var(--ok)' }} /></div>
                  </div>
                );
              })}
              <p className="xs muted">Porcentaje de acierto: las preguntas en rojo conviene repasarlas en clase.</p>
            </div>
          </Card>
          <div className="card list" style={{ overflow: 'hidden' }}>
            {ranked.map((s) => (
              <div key={s.id} className="list-item">
                <div className="grow">
                  <div className="h3">{s.lastName}, {s.firstName}</div>
                  {s.finishedAt && <div className="xs muted">{fmtDate(s.finishedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
                </div>
                {s.score !== null ? <Badge tone="ok">{s.correctCount}/{r.questions.length} · {s.score} pts</Badge> : <Badge>{s.hasAccount ? 'Sin responder' : 'Sin cuenta'}</Badge>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
