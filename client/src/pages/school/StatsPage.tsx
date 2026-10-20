import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronRight, ArrowLeft } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Badge, Card, Chips, Empty, ErrorBox, PageHeader, Skeleton } from '../../ui';
import type { LevelSettings, LevelType, PeriodKind } from '../../school/types';

interface OverviewDivision {
  id: number;
  name: string;
  level: { id: number; name: string; type: LevelType };
  students: number;
  attendance: { days: number; present: number; absent: number; late: number; early: number; percent: number | null };
  grades: { average: number | null; graded: number };
  alerts: number;
}
interface DivisionStats {
  division: { id: number; name: string };
  level: { id: number; name: string; type: LevelType; settings: LevelSettings };
  periods: Array<{ id: number; name: string; groupName: string | null; kind: PeriodKind; order: number; summaryOf: string | null }>;
  attendance: {
    percent: number | null;
    months: Array<{ month: string; present: number; absent: number; late: number; early: number; days: number }>;
    students: Array<{ id: number; firstName: string; lastName: string; days: number; absent: number; late: number; early: number; unjustified: number; percent: number | null }>;
  };
  grades: { subjects: Array<{ subjectId: number; subject: string; periodId: number; average: number | null; graded: number; failing: number; conceptual: number; distribution: Record<string, number> }> };
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
const COLORS = { present: 'var(--ok)', absent: 'var(--danger)', late: 'var(--accent)', early: 'var(--primary)' };

/** Barras apiladas por mes (SVG puro: liviano y se imprime bien). */
const StackedBars = ({ months }: { months: DivisionStats['attendance']['months'] }) => {
  const max = Math.max(1, ...months.map((m) => m.present + m.absent + m.late + m.early));
  const w = 44;
  const h = 160;
  return (
    <div className="table-wrap">
      <svg width={Math.max(320, months.length * (w + 12) + 40)} height={h + 40} role="img" aria-label="Asistencia por mes">
        {months.map((m, i) => {
          const x = 30 + i * (w + 12);
          const total = m.present + m.absent + m.late + m.early;
          let y = h;
          const seg = (n: number, color: string, label: string) => {
            if (!n) return null;
            const hh = (n / max) * h;
            y -= hh;
            return <rect key={label} x={x} y={y} width={w} height={hh} fill={color} rx={3}><title>{`${label}: ${n}`}</title></rect>;
          };
          return (
            <g key={m.month}>
              {seg(m.present, COLORS.present, 'Presentes')}
              {seg(m.absent, COLORS.absent, 'Ausentes')}
              {seg(m.late, COLORS.late, 'Tarde')}
              {seg(m.early, COLORS.early, 'Retiros')}
              <text x={x + w / 2} y={h + 16} textAnchor="middle" fontSize={11} fill="var(--text-3)">{monthLabel(m.month)}</text>
              <text x={x + w / 2} y={h + 30} textAnchor="middle" fontSize={10} fill="var(--text-3)">{total ? `${Math.round(((total - m.absent - (m.late + m.early) / 2) / total) * 100)}%` : ''}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const HBar = ({ value, max, color, label }: { value: number; max: number; color: string; label: string }) => (
  <div className="row" style={{ gap: 8 }}>
    <div className="progress grow" style={{ height: 10 }}><span style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, background: color }} /></div>
    <span className="xs" style={{ minWidth: 36, textAlign: 'right', fontWeight: 700 }}>{label}</span>
  </div>
);

const Legend = () => (
  <div className="row wrap xs muted" style={{ gap: 12 }}>
    {([['present', 'Presentes'], ['absent', 'Ausentes'], ['late', 'Llegadas tarde'], ['early', 'Retiros']] as const).map(([k, l]) => (
      <span key={k} className="row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[k], display: 'inline-block' }} /> {l}</span>
    ))}
  </div>
);

const DivisionPanel = ({ id, onBack }: { id: number; onBack: () => void }) => {
  const q = useQuery({ queryKey: ['stats-division', id], queryFn: () => apiGet<DivisionStats>(`/school/stats/division/${id}`) });
  const [periodId, setPeriodId] = useState<number | 'all'>('all');
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Skeleton count={3} h={160} />;
  const d = q.data;
  const s = d.level.settings;
  const numericPeriods = d.periods.filter((p) => p.kind === 'NUMERIC');
  const subjectsAll = [...new Map(d.grades.subjects.map((x) => [x.subjectId, x.subject])).entries()];
  const forPeriod = (subjectId: number, pid: number) => d.grades.subjects.find((x) => x.subjectId === subjectId && x.periodId === pid);
  // Promedio general del curso por período numérico (promedio de los promedios por materia, ponderado por notas).
  const periodAverage = (pid: number) => {
    const rows = d.grades.subjects.filter((x) => x.periodId === pid && x.average !== null);
    const n = rows.reduce((a, r) => a + r.graded, 0);
    return n ? Math.round((rows.reduce((a, r) => a + (r.average ?? 0) * r.graded, 0) / n) * 100) / 100 : null;
  };
  const worst = [...d.attendance.students].filter((st) => st.absent + st.late > 0).slice(0, 8);
  const maxAbs = Math.max(1, ...d.attendance.students.map((st) => st.absent + st.late + st.early));

  return (
    <div className="stack-lg">
      <button className="row small muted" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={onBack}><ArrowLeft size={16} /> Todos los cursos</button>
      <PageHeader title={d.division.name} subtitle={`${d.level.name} · ${d.attendance.students.length} alumnos`} />

      <section className="stack">
        <h2 className="h2">Asistencia</h2>
        <div className="grid grid-2 grid-4">
          <Card><div className="stat" style={{ padding: 0 }}><div className="value" style={{ color: (d.attendance.percent ?? 100) < 80 ? 'var(--danger)' : 'var(--ok)' }}>{d.attendance.percent ?? '—'}%</div><div className="label">Asistencia del curso</div></div></Card>
          <Card><div className="stat" style={{ padding: 0 }}><div className="value">{d.attendance.months.reduce((a, m) => a + m.absent, 0)}</div><div className="label">Inasistencias</div></div></Card>
          <Card><div className="stat" style={{ padding: 0 }}><div className="value">{d.attendance.months.reduce((a, m) => a + m.late, 0)}</div><div className="label">Llegadas tarde</div></div></Card>
          <Card><div className="stat" style={{ padding: 0 }}><div className="value">{d.attendance.months.reduce((a, m) => a + m.early, 0)}</div><div className="label">Retiros anticipados</div></div></Card>
        </div>
        {d.attendance.months.length ? (
          <Card>
            <div className="stack" style={{ gap: 8 }}>
              <div className="h3">Por mes</div>
              <StackedBars months={d.attendance.months} />
              <Legend />
            </div>
          </Card>
        ) : (
          <Empty title="Todavía no se tomó asistencia en este curso" />
        )}
        {worst.length > 0 && (
          <Card>
            <div className="stack" style={{ gap: 8 }}>
              <div className="h3">Alumnos con más inasistencias</div>
              {worst.map((st) => (
                <div key={st.id} className="stack" style={{ gap: 2 }}>
                  <div className="row-between small">
                    <Link to={`/alumnos/${st.id}`} style={{ fontWeight: 700 }}>{st.lastName}, {st.firstName}</Link>
                    <span className="xs muted">{st.absent} faltas · {st.late} tarde · {st.early} retiros{st.unjustified ? ` · ${st.unjustified} sin justificar` : ''} · {st.percent ?? '—'}%</span>
                  </div>
                  <HBar value={st.absent + st.late + st.early} max={maxAbs} color={st.percent !== null && st.percent < 75 ? 'var(--danger)' : 'var(--accent)'} label={`${st.absent + st.late + st.early}`} />
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>

      <section className="stack">
        <h2 className="h2">Notas</h2>
        {d.level.type === 'INICIAL' && <div className="alert alert-info small">En Inicial los informes son narrativos: no hay promedios.</div>}
        {d.level.type !== 'INICIAL' && !d.grades.subjects.length && <Empty title="Todavía no hay notas cargadas en este curso" />}
        {d.level.type !== 'INICIAL' && d.grades.subjects.length > 0 && (
          <>
            {numericPeriods.length > 0 && (
              <div className="grid grid-2 grid-4">
                {numericPeriods.map((p) => {
                  const avg = periodAverage(p.id);
                  return (
                    <Card key={p.id}>
                      <div className="stat" style={{ padding: 0 }}>
                        <div className="value" style={{ color: avg !== null && avg < s.passingGrade ? 'var(--danger)' : undefined }}>{avg ?? '—'}</div>
                        <div className="label">Promedio · {p.name}</div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            <Chips value={periodId} onChange={setPeriodId} items={[{ value: 'all' as const, label: 'Todos los períodos' }, ...d.periods.map((p) => ({ value: p.id, label: p.name }))]} />
            <div className="table-wrap card">
              <table className="table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Materia</th>
                    {d.periods.filter((p) => periodId === 'all' || p.id === periodId).map((p) => <th key={p.id} style={{ textAlign: 'center' }}>{p.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {subjectsAll.map(([subjectId, subject]) => (
                    <tr key={subjectId}>
                      <td style={{ fontWeight: 700 }}>{subject}</td>
                      {d.periods.filter((p) => periodId === 'all' || p.id === periodId).map((p) => {
                        const r = forPeriod(subjectId, p.id);
                        if (!r) return <td key={p.id} className="muted" style={{ textAlign: 'center' }}>—</td>;
                        if (p.kind === 'NUMERIC')
                          return (
                            <td key={p.id} style={{ textAlign: 'center' }}>
                              <b style={{ color: r.average !== null && r.average < s.passingGrade ? 'var(--danger)' : undefined }}>{r.average ?? '—'}</b>
                              <div className="xs muted">{r.graded} notas{r.failing ? ` · ${r.failing} desaprob.` : ''}</div>
                            </td>
                          );
                        const total = Object.values(r.distribution).reduce((a, b) => a + b, 0);
                        return (
                          <td key={p.id} style={{ textAlign: 'center' }}>
                            <div className="row wrap" style={{ gap: 4, justifyContent: 'center' }}>
                              {s.conceptualScale.filter((c) => r.distribution[c]).map((c, i) => (
                                <Badge key={c} tone={i === s.conceptualScale.length - 1 ? 'danger' : i === 0 ? 'ok' : undefined}>{c.slice(0, 12)} {r.distribution[c]}</Badge>
                              ))}
                            </div>
                            <div className="xs muted">{total} valoraciones</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="xs muted">Promedio = promedio de las notas numéricas cargadas (aprobación: {s.passingGrade}). Para la escala conceptual se muestra cuántos alumnos hay en cada valoración.</p>
          </>
        )}
      </section>
    </div>
  );
};

/** Panel de conducción: todos los cursos del alcance con su asistencia y promedio; tocar uno para ver el detalle. */
export default function StatsPage() {
  const { session } = useSchool();
  const [levelId, setLevelId] = useState<number>(0);
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['stats-overview', levelId], queryFn: () => apiGet<{ divisions: OverviewDivision[] }>(`/school/stats/overview${levelId ? `?levelId=${levelId}` : ''}`) });
  const divisions = q.data?.divisions ?? [];
  const totals = useMemo(() => {
    const t = divisions.reduce((a, d) => ({ students: a.students + d.students, absent: a.absent + d.attendance.absent, late: a.late + d.attendance.late, days: a.days + d.attendance.days, w: a.w + (d.attendance.percent !== null ? (100 - d.attendance.percent) * d.attendance.days : 0) }), { students: 0, absent: 0, late: 0, days: 0, w: 0 });
    return { ...t, percent: t.days ? Math.round((100 - t.w / t.days) * 10) / 10 : null };
  }, [divisions]);

  if (divisionId) return <DivisionPanel id={divisionId} onBack={() => setDivisionId(null)} />;

  return (
    <div className="stack-lg">
      <PageHeader title="Estadísticas por curso" subtitle="Asistencia, inasistencias, llegadas tarde y promedios de cada curso de tu alcance. Tocá un curso para ver los gráficos por mes y por materia." />
      {(session?.levels.length ?? 0) > 1 && <Chips value={levelId} onChange={setLevelId} items={[{ value: 0, label: 'Todos los niveles' }, ...(session?.levels ?? []).map((l) => ({ value: l.id, label: l.name }))]} />}
      {q.error && <ErrorBox error={q.error} />}
      {q.isLoading && <Skeleton count={4} h={80} />}
      {!q.isLoading && !divisions.length && <Empty title="No hay cursos en tu alcance" icon={<BarChart3 size={36} strokeWidth={1.5} />} />}
      {divisions.length > 0 && (
        <>
          <div className="grid grid-2 grid-4">
            <Card><div className="stat" style={{ padding: 0 }}><div className="value">{totals.students}</div><div className="label">Alumnos</div></div></Card>
            <Card><div className="stat" style={{ padding: 0 }}><div className="value" style={{ color: (totals.percent ?? 100) < 80 ? 'var(--danger)' : 'var(--ok)' }}>{totals.percent ?? '—'}%</div><div className="label">Asistencia general</div></div></Card>
            <Card><div className="stat" style={{ padding: 0 }}><div className="value">{totals.absent}</div><div className="label">Inasistencias</div></div></Card>
            <Card><div className="stat" style={{ padding: 0 }}><div className="value">{totals.late}</div><div className="label">Llegadas tarde</div></div></Card>
          </div>
          <div className="table-wrap card">
            <table className="table">
              <thead>
                <tr><th>Curso</th><th>Alumnos</th><th>Asistencia</th><th>Faltas</th><th>Tarde</th><th>Retiros</th><th>Promedio</th><th>Alertas</th><th /></tr>
              </thead>
              <tbody>
                {divisions.map((d) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setDivisionId(d.id)}>
                    <td><b>{d.name}</b><div className="xs muted">{d.level.name}</div></td>
                    <td>{d.students}</td>
                    <td>
                      {d.attendance.percent === null ? <span className="muted">—</span> : (
                        <div className="stack" style={{ gap: 2, minWidth: 110 }}>
                          <b style={{ color: d.attendance.percent < 80 ? 'var(--danger)' : 'var(--ok)' }}>{d.attendance.percent}%</b>
                          <div className="progress" style={{ height: 6 }}><span style={{ width: `${d.attendance.percent}%`, background: d.attendance.percent < 80 ? 'var(--danger)' : 'var(--ok)' }} /></div>
                        </div>
                      )}
                    </td>
                    <td>{d.attendance.absent}</td>
                    <td>{d.attendance.late}</td>
                    <td>{d.attendance.early}</td>
                    <td>{d.level.type === 'INICIAL' ? <span className="muted">—</span> : d.grades.average === null ? <span className="muted">sin notas</span> : <b>{d.grades.average}</b>}</td>
                    <td>{d.alerts ? <Badge tone="danger">{d.alerts}</Badge> : <span className="muted">0</span>}</td>
                    <td><ChevronRight size={16} className="muted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
