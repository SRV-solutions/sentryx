import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Copy, Check, ArrowUp, ArrowDown } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Card, ErrorBox, Field, Skeleton, useToast } from '../../ui';
import { PlanGate } from '../../school/PlanGate';
import { PlanFeature } from '../../school/plans';
import { OptionShape, POINTS, Quiz, QuizQuestion, TIME_LIMITS, cleanQuestion, newQuestion } from '../../school/quiz';
import type { Structure } from '../../school/types';

interface UnitOption { id: number; title: string; order: number; subjectId: number; subject?: string; division: string | null }
type Draft = { title: string; description: string; subjectId: number | ''; programUnitId: number | ''; questions: QuizQuestion[] };

const QuestionEditor = ({ q, index, total, onChange, onRemove, onMove, onDuplicate }: {
  q: QuizQuestion; index: number; total: number;
  onChange: (q: QuizQuestion) => void; onRemove: () => void; onMove: (delta: number) => void; onDuplicate: () => void;
}) => {
  const setOption = (i: number, patch: Partial<QuizQuestion['options'][number]>) => onChange({ ...q, options: q.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  return (
    <Card>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="h3 grow">Pregunta {index + 1}</span>
          <button type="button" className="icon-btn" aria-label="Subir" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
          <button type="button" className="icon-btn" aria-label="Bajar" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
          <button type="button" className="icon-btn" aria-label="Duplicar" onClick={onDuplicate}><Copy size={15} /></button>
          <button type="button" className="icon-btn" aria-label="Quitar pregunta" onClick={onRemove}><Trash2 size={15} /></button>
        </div>
        <textarea className="textarea" rows={2} maxLength={300} placeholder="Escribí la pregunta" value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} style={{ fontSize: 17, fontWeight: 700 }} />
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="row xs" style={{ gap: 4 }}>Tiempo
            <select className="select" style={{ width: 100 }} value={q.timeLimit} onChange={(e) => onChange({ ...q, timeLimit: Number(e.target.value) })}>
              {TIME_LIMITS.map((t) => <option key={t} value={t}>{t} s</option>)}
            </select>
          </label>
          <label className="row xs" style={{ gap: 4 }}>Puntos
            <select className="select" style={{ width: 170 }} value={q.points} onChange={(e) => onChange({ ...q, points: Number(e.target.value) })}>
              {POINTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <div className="quiz-grid stack-mobile">
          {q.options.map((o, i) => (
            <div key={i} className={`quiz-opt quiz-opt-${i}`} style={{ minHeight: 56, padding: '8px 10px' }}>
              <OptionShape index={i} />
              <input
                className="input quiz-opt-input"
                maxLength={120}
                placeholder={i < 2 ? `Respuesta ${i + 1}` : `Respuesta ${i + 1} (opcional)`}
                value={o.text}
                onChange={(e) => setOption(i, { text: e.target.value })}
              />
              <button
                type="button"
                aria-label={o.correct ? 'Es correcta' : 'Marcar como correcta'}
                aria-pressed={o.correct}
                onClick={() => setOption(i, { correct: !o.correct })}
                style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', border: '3px solid #fff', background: o.correct ? '#fff' : 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                {o.correct && <Check size={18} color="#26890c" strokeWidth={4} />}
              </button>
            </div>
          ))}
        </div>
        <p className="xs muted">Tocá el círculo para marcar la(s) respuesta(s) correcta(s).</p>
      </div>
    </Card>
  );
};

export default function QuizEditorPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSchool();
  const quiz = useQuery({ queryKey: ['quiz', id], queryFn: () => apiGet<Quiz>(`/school/quizzes/${id}`), enabled: !!id });
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const units = useQuery({ queryKey: ['program-units'], queryFn: () => apiGet<UnitOption[]>('/school/programs/units') });
  const [d, setD] = useState<Draft>({ title: '', description: '', subjectId: '', programUnitId: '', questions: [newQuestion()] });
  const [error, setError] = useState('');

  useEffect(() => {
    if (quiz.data) setD({ title: quiz.data.title, description: quiz.data.description, subjectId: quiz.data.subjectId ?? '', programUnitId: quiz.data.programUnitId ?? '', questions: quiz.data.questions.length ? quiz.data.questions.map((q) => ({ ...q, options: [...q.options, ...Array(4 - q.options.length).fill(null).map(() => ({ text: '', correct: false }))] })) : [newQuestion()] });
  }, [quiz.data]);

  // Materias que dicta (o todas las del colegio si no dicta ninguna, para directivos).
  const subjects = useMemo(() => {
    const mine = new Set(session?.teaching.map((t) => t.subjectId));
    const all = structure.data?.subjects ?? [];
    const own = all.filter((s) => mine.has(s.id) || s.id === quiz.data?.subjectId);
    return own.length ? own : all;
  }, [structure.data, session, quiz.data?.subjectId]);
  // La unidad ya enlazada se muestra aunque sea de un programa que hoy no ve (ej: de otro curso).
  const linked = quiz.data?.ProgramUnit;
  const allUnits = [...(units.data ?? []), ...(linked && !units.data?.some((u) => u.id === linked.id) ? [{ id: linked.id, title: linked.title, order: linked.order, subjectId: quiz.data!.subjectId ?? 0, subject: quiz.data?.Subject?.name, division: null }] : [])];
  const unitOptions = allUnits.filter((u) => !d.subjectId || u.subjectId === d.subjectId);

  const save = useMutation({
    mutationFn: () => {
      const body = { title: d.title, description: d.description, subjectId: d.subjectId || null, programUnitId: d.programUnitId || null, questions: d.questions.map(cleanQuestion) };
      return id ? apiSend<Quiz>('PUT', `/school/quizzes/${id}`, body) : apiSend<Quiz>('POST', '/school/quizzes', body);
    },
    onSuccess: (saved) => {
      toast('Juego guardado');
      qc.invalidateQueries({ queryKey: ['quizzes'] });
      qc.invalidateQueries({ queryKey: ['quiz', saved.id] });
      navigate('/juegos');
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: () => apiSend('DELETE', `/school/quizzes/${id}`),
    onSuccess: () => (toast('Juego eliminado'), qc.invalidateQueries({ queryKey: ['quizzes'] }), navigate('/juegos')),
    onError: (e: Error) => toast(e.message, true),
  });
  const setQuestion = (i: number, q: QuizQuestion) => setD({ ...d, questions: d.questions.map((x, j) => (j === i ? q : x)) });
  const move = (i: number, delta: number) => {
    const qs = [...d.questions];
    const [q] = qs.splice(i, 1);
    qs.splice(i + delta, 0, q);
    setD({ ...d, questions: qs });
  };
  const problems = d.questions
    .map((q, i) => (!q.text.trim() ? `Pregunta ${i + 1}: falta el texto` : q.options.filter((o) => o.text.trim()).length < 2 ? `Pregunta ${i + 1}: completá al menos 2 respuestas` : !q.options.some((o) => o.correct && o.text.trim()) ? `Pregunta ${i + 1}: marcá una respuesta correcta` : null))
    .filter(Boolean) as string[];

  return (
    <div className="stack-lg">
      <Link to="/juegos" className="row small muted"><ArrowLeft size={16} /> Juegos</Link>
      <PlanGate feature={PlanFeature.QUIZZES} title="Juegos de preguntas">
        {quiz.error && <ErrorBox error={quiz.error} />}
        {id && quiz.isLoading ? (
          <Skeleton count={3} h={120} />
        ) : (
          <>
            <Card>
              <div className="stack">
                <Field label="Título"><input className="input" maxLength={160} placeholder="Ej: Repaso de fracciones" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
                <div className="grid grid-2">
                  <Field label="Materia">
                    <select className="select" value={d.subjectId} onChange={(e) => setD({ ...d, subjectId: e.target.value ? Number(e.target.value) : '', programUnitId: '' })}>
                      <option value="">Sin materia</option>
                      {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Unidad del programa" hint={unitOptions.length ? undefined : 'Cargá el programa de la materia para enlazar el juego a una unidad.'}>
                    <select className="select" value={d.programUnitId} onChange={(e) => setD({ ...d, programUnitId: e.target.value ? Number(e.target.value) : '' })}>
                      <option value="">Sin enlazar</option>
                      {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.subject}{u.division ? ` (${u.division})` : ''} · U{u.order}: {u.title}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Descripción (opcional)"><textarea className="textarea" rows={2} maxLength={2000} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
              </div>
            </Card>
            {d.questions.map((q, i) => (
              <QuestionEditor
                key={q.id}
                q={q}
                index={i}
                total={d.questions.length}
                onChange={(nq) => setQuestion(i, nq)}
                onRemove={() => setD({ ...d, questions: d.questions.filter((_x, j) => j !== i) })}
                onMove={(delta) => move(i, delta)}
                onDuplicate={() => setD({ ...d, questions: [...d.questions.slice(0, i + 1), { ...q, id: newQuestion().id, options: q.options.map((o) => ({ ...o })) }, ...d.questions.slice(i + 1)] })}
              />
            ))}
            <button className="btn btn-ghost" disabled={d.questions.length >= 60} onClick={() => setD({ ...d, questions: [...d.questions, newQuestion()] })}><Plus size={16} /> Agregar pregunta</button>
            {problems.length > 0 && <div className="alert alert-warn small"><div>{problems.slice(0, 3).map((p) => <div key={p}>{p}</div>)}</div></div>}
            {error && <div className="alert alert-danger small">{error}</div>}
            <div className="row save-bar" style={{ gap: 8 }}>
              {id && <button className="btn btn-ghost" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 size={16} /></button>}
              <button className="btn btn-accent grow" disabled={save.isPending || !d.title.trim() || !d.questions.length || problems.length > 0} onClick={() => (setError(''), save.mutate())}>{save.isPending ? 'Guardando…' : 'Guardar juego'}</button>
            </div>
          </>
        )}
      </PlanGate>
    </div>
  );
}
