/** Administración → Ciclo lectivo: crear el ciclo siguiente y la promoción anual masiva. */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, GraduationCap } from 'lucide-react';
import { apiGet, apiSend } from '../../../lib/api';
import { Badge, Card, ErrorBox, Field, Sheet, Skeleton, useToast } from '../../../ui';
import type { Structure } from '../../../school/types';

type Outcome = 'PROMOTED' | 'REPEATS' | 'GRADUATED';
interface PlanDivision { id: number; name: string; levelId: number; levelName: string; gradeYear: number }
interface PromotionPlan {
  fromYear: number;
  toYear: number;
  targetDivisions: PlanDivision[];
  divisions: Array<{
    division: PlanDivision;
    suggestedOutcome: Outcome;
    suggestedTargetId: number | null;
    repeatTargetId: number | null;
    students: Array<{ id: number; firstName: string; lastName: string; alreadyEnrolledInTarget: boolean }>;
  }>;
}
interface Move { outcome: Outcome; targetDivisionId: number | null }

const OUTCOME_LABELS: Record<Outcome, string> = { PROMOTED: 'Promueve', REPEATS: 'Repite', GRADUATED: 'Egresa' };

/** Alta del ciclo siguiente copiando los cursos (y opcionalmente los docentes) del actual. */
const CreateNextYearCard = ({ currentYear }: { currentYear: number }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const next = currentYear + 1;
  const [form, setForm] = useState({ startDate: `${next}-03-01`, endDate: `${next}-12-20`, copyAssignments: true });
  const create = useMutation({
    mutationFn: () => apiSend<{ divisionsCopied: number }>('POST', '/school/years', { year: next, ...form, makeCurrent: false, copyDivisionsFromCurrent: true }),
    onSuccess: (r) => (toast(`Ciclo ${next} creado con ${r.divisionsCopied} cursos`), qc.invalidateQueries({ queryKey: ['structure'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <Card>
      <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), create.mutate())}>
        <h3 className="h3 row"><CalendarPlus size={18} /> Preparar el ciclo {next}</h3>
        <p className="small muted">Se crean los mismos cursos que en {currentYear} y los períodos de evaluación. El ciclo actual sigue siendo {currentYear} hasta que apliques la promoción.</p>
        <div className="grid grid-2">
          <Field label="Inicio de clases"><input className="input" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          <Field label="Fin de clases"><input className="input" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
        </div>
        <label className="row small"><input type="checkbox" checked={form.copyAssignments} onChange={(e) => setForm({ ...form, copyAssignments: e.target.checked })} /> Copiar también qué docente da cada materia</label>
        <button className="btn btn-accent" style={{ alignSelf: 'flex-start' }} disabled={create.isPending}>{create.isPending ? 'Creando…' : `Crear ciclo ${next}`}</button>
      </form>
    </Card>
  );
};

/** Plan de promoción: un destino por alumno (sugerido automáticamente) y aplicación en un paso. */
const PromotionPlanner = ({ targetYearId }: { targetYearId: number }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const plan = useQuery({ queryKey: ['promotion-plan', targetYearId], queryFn: () => apiGet<PromotionPlan>(`/school/promotions/plan?targetYearId=${targetYearId}`) });
  const [moves, setMoves] = useState<Record<number, Move>>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!plan.data) return;
    const initial: Record<number, Move> = {};
    for (const group of plan.data.divisions)
      for (const student of group.students) if (!student.alreadyEnrolledInTarget) initial[student.id] = { outcome: group.suggestedOutcome, targetDivisionId: group.suggestedTargetId };
    setMoves(initial);
  }, [plan.data]);

  const apply = useMutation({
    mutationFn: () =>
      apiSend<{ promoted: number; repeating: number; graduated: number; skipped: number }>('POST', '/school/promotions', {
        targetYearId,
        moves: Object.entries(moves).map(([studentId, move]) => ({ studentId: Number(studentId), ...move })),
      }),
    onSuccess: (r) => {
      toast(`Listo: ${r.promoted} promovidos, ${r.repeating} repiten, ${r.graduated} egresados. Ya estás en el ciclo ${plan.data?.toYear}.`);
      setConfirming(false);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const totals = useMemo(() => {
    const values = Object.values(moves);
    return { PROMOTED: values.filter((m) => m.outcome === 'PROMOTED').length, REPEATS: values.filter((m) => m.outcome === 'REPEATS').length, GRADUATED: values.filter((m) => m.outcome === 'GRADUATED').length };
  }, [moves]);
  const missingTarget = Object.values(moves).filter((m) => m.outcome !== 'GRADUATED' && !m.targetDivisionId).length;

  if (plan.isLoading) return <Skeleton count={3} h={120} />;
  if (plan.error) return <ErrorBox error={plan.error} />;
  const p = plan.data!;
  const targetOptions = (
    <>
      <option value="">Curso {p.toYear}…</option>
      {p.targetDivisions.map((d) => <option key={d.id} value={d.id}>{d.levelName} · {d.name}</option>)}
    </>
  );
  const setMove = (studentId: number, patch: Partial<Move>, group: PromotionPlan['divisions'][number]) =>
    setMoves((all) => {
      const current = all[studentId];
      const next = { ...current, ...patch };
      // Al cambiar el resultado, se propone el curso que corresponde (mismo año si repite, el siguiente si promueve).
      if (patch.outcome && !patch.targetDivisionId) next.targetDivisionId = patch.outcome === 'GRADUATED' ? null : patch.outcome === 'REPEATS' ? group.repeatTargetId : group.suggestedTargetId;
      return { ...all, [studentId]: next };
    });

  return (
    <div className="stack">
      <Card>
        <div className="row wrap" style={{ gap: 12 }}>
          <GraduationCap size={22} className="accent" />
          <div className="grow" style={{ minWidth: 200 }}>
            <div className="h3">Promoción {p.fromYear} → {p.toYear}</div>
            <div className="xs muted">Revisá el destino de cada alumno. Por defecto todos promueven al año siguiente; los del último año egresan.</div>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <Badge tone="ok">{totals.PROMOTED} promueven</Badge>
            <Badge tone="warn">{totals.REPEATS} repiten</Badge>
            <Badge tone="info">{totals.GRADUATED} egresan</Badge>
          </div>
        </div>
      </Card>
      {p.divisions.filter((g) => g.students.length).map((group) => (
        <details key={group.division.id} className="card" style={{ padding: 14 }}>
          <summary className="row-between" style={{ cursor: 'pointer' }}>
            <span className="h3">{group.division.levelName} · {group.division.name}</span>
            <span className="xs muted">
              {group.students.length} alumnos → {group.suggestedOutcome === 'GRADUATED' ? 'egresan' : p.targetDivisions.find((d) => d.id === group.suggestedTargetId)?.name ?? 'sin curso sugerido'}
            </span>
          </summary>
          <div className="stack" style={{ gap: 6, marginTop: 10 }}>
            <label className="row xs muted" style={{ gap: 6 }}>
              Mover a todos a
              <select
                className="select"
                style={{ maxWidth: 240 }}
                value=""
                onChange={(e) => {
                  const targetDivisionId = Number(e.target.value);
                  if (targetDivisionId) setMoves((all) => ({ ...all, ...Object.fromEntries(group.students.filter((s) => all[s.id]).map((s) => [s.id, { outcome: all[s.id].outcome === 'GRADUATED' ? 'PROMOTED' : all[s.id].outcome, targetDivisionId }])) }));
                }}
              >
                {targetOptions}
              </select>
            </label>
            {group.students.map((student) => {
              const move = moves[student.id];
              return (
                <div key={student.id} className="row wrap" style={{ gap: 6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  <span className="small grow" style={{ minWidth: 160 }}>{student.lastName}, {student.firstName}</span>
                  {!move ? (
                    <Badge>Ya inscripto en {p.toYear}</Badge>
                  ) : (
                    <>
                      <select className="select" style={{ width: 120 }} value={move.outcome} onChange={(e) => setMove(student.id, { outcome: e.target.value as Outcome }, group)}>
                        {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((o) => <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>)}
                      </select>
                      {move.outcome !== 'GRADUATED' && (
                        <select className="select" style={{ width: 200 }} value={move.targetDivisionId ?? ''} onChange={(e) => setMove(student.id, { targetDivisionId: e.target.value ? Number(e.target.value) : null }, group)}>
                          {targetOptions}
                        </select>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ))}
      {missingTarget > 0 && <div className="alert alert-danger small">{missingTarget} alumnos no tienen curso de destino.</div>}
      <button className="btn btn-accent" disabled={!Object.keys(moves).length || missingTarget > 0} onClick={() => setConfirming(true)}>Aplicar promoción y pasar al ciclo {p.toYear}</button>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title={`Pasar al ciclo ${p.toYear}`}>
        <div className="stack">
          <p className="small">
            Se inscribe a {totals.PROMOTED + totals.REPEATS} alumnos en sus cursos de {p.toYear} y {totals.GRADUATED} quedan como egresados. El ciclo {p.toYear} pasa a ser el actual
            para toda la escuela. Las notas y la asistencia de {p.fromYear} quedan guardadas como historial.
          </p>
          <div className="row">
            <button className="btn btn-ghost grow" onClick={() => setConfirming(false)}>Cancelar</button>
            <button className="btn btn-accent grow" disabled={apply.isPending} onClick={() => apply.mutate()}>{apply.isPending ? 'Aplicando…' : 'Confirmar'}</button>
          </div>
        </div>
      </Sheet>
    </div>
  );
};

export const AcademicYearTab = () => {
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure') });
  if (structure.isLoading) return <Skeleton count={2} h={120} />;
  if (structure.error) return <ErrorBox error={structure.error} />;
  const years = structure.data!.years;
  const current = years.find((y) => y.isCurrent);
  if (!current) return <ErrorBox error={new Error('No hay un ciclo lectivo marcado como actual.')} />;
  const nextYear = years.filter((y) => y.year > current.year).sort((a, b) => a.year - b.year)[0];
  return (
    <div className="stack-lg">
      <p className="small muted">Ciclo actual: <b>{current.year}</b>. Para cerrar el año: 1) preparás el ciclo siguiente, 2) revisás quién promueve, repite o egresa, 3) aplicás.</p>
      {nextYear ? <PromotionPlanner targetYearId={nextYear.id} /> : <CreateNextYearCard currentYear={current.year} />}
    </div>
  );
};
