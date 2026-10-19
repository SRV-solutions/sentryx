import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trophy, Check, X } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { Card, ErrorBox, Skeleton, fmtDate, useToast } from '../../ui';
import { OptionShape, QuizOption } from '../../school/quiz';

interface Review { text: string; options: QuizOption[]; chosen: number | null }
interface Attempt { score: number; correctCount: number; questionCount: number; review: Review[] | null }
interface ToPlay {
  id: number;
  title: string;
  description: string;
  closesAt: string;
  open: boolean;
  questions: Array<{ id: string; text: string; options: string[] }>;
  attempt: Attempt | null;
}

const ResultView = ({ attempt }: { attempt: Attempt }) => (
  <div className="stack">
    <Card>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 6 }}>
        <Trophy size={44} className="accent" />
        <div className="h1">{attempt.score} puntos</div>
        <div className="small muted">{attempt.correctCount} de {attempt.questionCount} respuestas correctas</div>
      </div>
    </Card>
    {attempt.review?.map((r, i) => {
      const ok = r.chosen !== null && r.options[r.chosen]?.correct;
      return (
        <Card key={i}>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6 }}>{ok ? <Check size={18} color="var(--ok)" /> : <X size={18} color="var(--danger)" />}<b className="small">{r.text}</b></div>
            {r.options.map((o, j) => (
              <div key={j} className="small" style={{ paddingLeft: 24, color: o.correct ? 'var(--ok)' : j === r.chosen ? 'var(--danger)' : undefined, fontWeight: o.correct || j === r.chosen ? 700 : 400 }}>
                {o.correct ? '✓ ' : j === r.chosen ? '✗ ' : '· '}{o.text}{j === r.chosen ? ' (tu respuesta)' : ''}
              </div>
            ))}
          </div>
        </Card>
      );
    })}
  </div>
);

/** Estudiante: responder un juego asignado como tarea (una sola vez). */
export default function QuizHomeworkPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const toast = useToast();
  const data = useQuery({ queryKey: ['quiz-homework', id], queryFn: () => apiGet<ToPlay>(`/school/quiz-assignments/${id}/play`) });
  const [index, setIndex] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const submit = useMutation({
    mutationFn: () => apiSend<Attempt>('POST', `/school/quiz-assignments/${id}/attempt`, { answers: Object.entries(answers).map(([questionId, option]) => ({ questionId, option })) }),
    onSuccess: (attempt) => {
      qc.setQueryData(['quiz-homework', id], (old: ToPlay | undefined) => (old ? { ...old, questions: [], attempt } : old));
      qc.invalidateQueries({ queryKey: ['quiz-assignments'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const g = data.data;
  const q = g && index >= 0 ? g.questions[index] : null;
  const choose = (option: number) => {
    if (!g || !q) return;
    const next = { ...answers, [q.id]: option };
    setAnswers(next);
    if (index + 1 < g.questions.length) setTimeout(() => setIndex(index + 1), 250);
  };
  const done = !!g && g.questions.length > 0 && g.questions.every((x) => answers[x.id] !== undefined);

  return (
    <div className="stack-lg">
      <Link to="/juegos" className="row small muted"><ArrowLeft size={16} /> Juegos</Link>
      {data.error && <ErrorBox error={data.error} />}
      {!g && !data.error && <Skeleton count={2} h={120} />}
      {g && (
        <>
          <h1 className="h1">{g.title}</h1>
          {g.attempt ? (
            <ResultView attempt={g.attempt} />
          ) : !g.open ? (
            <Card><p className="small">Este juego cerró el {fmtDate(g.closesAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.</p></Card>
          ) : index < 0 ? (
            <Card>
              <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
                {g.description && <p className="small">{g.description}</p>}
                <p className="small muted">{g.questions.length} preguntas · una sola oportunidad · cierra el {fmtDate(g.closesAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                <button className="btn btn-accent" style={{ minWidth: 200 }} onClick={() => setIndex(0)}>Empezar</button>
              </div>
            </Card>
          ) : (
            q && (
              <div className="stack">
                <div className="progress"><span style={{ width: `${((index + 1) / g.questions.length) * 100}%` }} /></div>
                <div className="small muted">Pregunta {index + 1} de {g.questions.length}</div>
                <div className="h2">{q.text}</div>
                <div className="quiz-grid stack-mobile">
                  {q.options.map((text, i) => (
                    <button key={i} className={`quiz-opt quiz-opt-${i} ${answers[q.id] === i ? 'chosen' : ''}`} onClick={() => choose(i)}>
                      <OptionShape index={i} /> {text}
                    </button>
                  ))}
                </div>
                <div className="row-between">
                  <button className="btn btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>Anterior</button>
                  {index + 1 < g.questions.length ? (
                    <button className="btn btn-ghost" onClick={() => setIndex(index + 1)}>Saltear</button>
                  ) : (
                    <button className="btn btn-accent" disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? 'Enviando…' : done ? 'Enviar respuestas' : 'Enviar (hay preguntas sin responder)'}</button>
                  )}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
