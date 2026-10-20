import type { ReportCard, Period, GradeValue } from './types';
import { Badge } from '../ui';

const cell = (g: GradeValue | undefined, kind: Period['kind']) => {
  if (!g) return <span className="muted">—</span>;
  const tone = g.atRisk ? { color: 'var(--danger)', fontWeight: 800 } : { fontWeight: 700 };
  if (kind === 'NUMERIC') return <span style={tone}>{g.numericValue ?? '—'}</span>;
  if (kind === 'CONCEPTUAL') return <span style={tone}>{g.conceptualValue ?? '—'}</span>;
  return <span className="small">{g.narrative ? 'Ver informe' : '—'}</span>;
};

/**
 * Boletín adaptado al nivel:
 * - Secundario: bimestres agrupados por cuatrimestre + nota final (promedio de los numéricos).
 * - Primario: escala conceptual por trimestre.
 * - Inicial: informes narrativos (se muestran como texto, no como tabla).
 */
export const ReportCardView = ({ data }: { data: ReportCard }) => {
  if (!data.periods.length)
    return <div className="alert alert-info">Todavía no hay calificaciones publicadas para este ciclo.</div>;

  if (data.level.type === 'INICIAL' || data.periods.every((p) => p.kind === 'NARRATIVE')) {
    return (
      <div className="stack">
        {data.periods.map((p) => (
          <section key={p.id} className="card card-pad stack">
            <h3 className="h2">{p.name}</h3>
            {data.rows.map((r) => {
              const g = r.grades[p.id];
              if (!g?.narrative && !g?.observation) return null;
              return (
                <div key={r.subjectId} className="stack" style={{ gap: 4 }}>
                  {data.rows.length > 1 && <div className="h3">{r.subject}</div>}
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{g.narrative}</p>
                  {g.observation && <p className="small muted">{g.observation}</p>}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    );
  }

  const groups = data.periods.reduce<Array<{ name: string | null; periods: Period[] }>>((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && last.name === p.groupName) last.periods.push(p);
    else acc.push({ name: p.groupName, periods: [p] });
    return acc;
  }, []);
  const hasGroups = groups.some((g) => g.name);
  const numeric = data.periods.filter((p) => p.kind === 'NUMERIC');
  const hasFinal = numeric.length > 0;
  const narrativePeriods = data.periods.filter((p) => p.kind === 'NARRATIVE');
  const s = data.level.settings;
  const legend = [
    data.periods.some((p) => p.kind === 'CONCEPTUAL') ? `Escala conceptual: ${s.conceptualScale.join(' · ')}.` : null,
    numeric.length ? `Nota numérica de ${s.numericMin} a ${s.numericMax}; aprobación: ${s.passingGrade}.` : null,
    hasFinal ? (data.periods.some((p) => p.summaryOf) ? 'Nota cuatr. = nota de cierre de cada cuatrimestre; Final = promedio de las dos.' : 'Final = promedio de las notas numéricas.') : null,
    narrativePeriods.length ? 'Los informes escritos están debajo de la tabla.' : null,
  ].filter(Boolean).join(' ');

  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="table">
          <thead>
            {hasGroups && (
              <tr>
                <th className="sticky-col" />
                {groups.map((g, i) => (
                  <th key={i} colSpan={g.periods.length} style={{ textAlign: 'center' }}>{g.name}</th>
                ))}
                {hasFinal && <th />}
              </tr>
            )}
            <tr>
              <th className="sticky-col">Materia</th>
              {data.periods.map((p) => (
                <th key={p.id} title={p.summaryOf ? `Nota de cierre del ${p.summaryOf}` : p.kind === 'CONCEPTUAL' ? 'Conceptual' : 'Numérica'} style={p.summaryOf ? { background: 'var(--surface-2)' } : undefined}>
                  {p.summaryOf ? 'Nota cuatr.' : p.name.replace('Bimestre', 'Bim.').replace('Trimestre', 'Trim.')}
                </th>
              ))}
              {hasFinal && <th>Final</th>}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.subjectId}>
                <td className="sticky-col" style={{ fontWeight: 700 }}>{r.subject}</td>
                {data.periods.map((p) => (
                  <td key={p.id}>{cell(r.grades[p.id], p.kind)}</td>
                ))}
                {hasFinal && (
                  <td>{r.final === null ? <span className="muted">—</span> : <Badge tone={r.finalApproved ? 'ok' : 'danger'}>{r.final}</Badge>}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="xs muted">{legend} En rojo: valoraciones por debajo de lo esperado.</p>
      {narrativePeriods.map((p) => {
        const rows = data.rows.filter((r) => r.grades[p.id]?.narrative);
        if (!rows.length) return null;
        return (
          <section key={p.id} className="card card-pad stack">
            <h3 className="h3">{p.name}</h3>
            {rows.map((r) => (
              <div key={r.subjectId} className="stack" style={{ gap: 4 }}>
                {data.rows.length > 1 && <div className="small" style={{ fontWeight: 700 }}>{r.subject}</div>}
                <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{r.grades[p.id].narrative}</p>
              </div>
            ))}
          </section>
        );
      })}
      {data.rows.some((r) => Object.values(r.grades).some((g) => g.observation)) && (
        <section className="card card-pad stack">
          <h3 className="h3">Observaciones</h3>
          {data.rows.flatMap((r) =>
            data.periods
              .filter((p) => r.grades[p.id]?.observation)
              .map((p) => (
                <p key={`${r.subjectId}-${p.id}`} className="small">
                  <b>{r.subject} · {p.name}:</b> {r.grades[p.id].observation}
                </p>
              ))
          )}
        </section>
      )}
    </div>
  );
};
