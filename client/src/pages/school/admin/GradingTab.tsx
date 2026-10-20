/** Administración → Calificaciones: cómo se califica en cada nivel (lo define la conducción del nivel). */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';
import { apiGet, apiSend } from '../../../lib/api';
import { useSchool } from '../../../school/SchoolContext';
import { Badge, Card, ErrorBox, Skeleton, useToast, Chips, Field } from '../../../ui';
import { GRADING_MODE_LABELS, type GradingMode, type Structure, type Level, type PeriodKind } from '../../../school/types';
import { GradingSchemeCard, SummaryPeriodsCard } from './AcademicSetupCards';

const MODE_HELP: Record<GradingMode, string> = {
  NUMERIC: 'Todos los períodos con nota numérica (ej: 1 a 10). La final anual es el promedio.',
  CONCEPTUAL: 'Todos los períodos con la escala de palabras del nivel (ej: Sobresaliente … Insuficiente). Sin promedio.',
  NARRATIVE: 'Cada período es un informe escrito por materia o por sala (Inicial).',
  MIXED: 'Esquema clásico de Secundario: 1º y 3º bimestre conceptual, 2º y 4º numérico (más la nota de cuatrimestre, si la agregás).',
};
const KIND_LABELS: Record<PeriodKind, string> = { NUMERIC: 'Numérica', CONCEPTUAL: 'Conceptual (letras)', NARRATIVE: 'Informe' };
const defaultMode = (l: Level): GradingMode => l.settings.gradingMode ?? (l.type === 'INICIAL' ? 'NARRATIVE' : l.type === 'PRIMARIO' ? 'CONCEPTUAL' : 'MIXED');

export const GradingTab = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSchool();
  const s = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure') });
  const [levelId, setLevelId] = useState<number | null>(null);
  // Solo los niveles del alcance de quien mira (la Rectora de Secundario configura Secundario).
  const scopeIds = new Set(session?.levels.map((l) => l.id) ?? []);
  const levels = s.data?.levels.filter((l) => scopeIds.has(l.id)) ?? [];
  const level = levels.find((l) => l.id === (levelId ?? levels[0]?.id));
  const [form, setForm] = useState<Level['settings'] | null>(null);
  useEffect(() => setForm(level ? { ...level.settings, gradingMode: defaultMode(level) } : null), [level?.id, level?.settings]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['structure'] });
  const onErr = (e: Error) => toast(e.message, true);
  const save = useMutation({ mutationFn: (settings: Level['settings']) => apiSend('PATCH', `/school/levels/${level!.id}`, { settings }), onSuccess: () => (refresh(), toast('Configuración guardada')), onError: onErr });
  const applyMode = useMutation({
    mutationFn: () => apiSend<{ updated: number; skipped: number }>('POST', `/school/levels/${level!.id}/grading-mode/apply`, {}),
    onSuccess: (r) => (refresh(), toast(r.updated ? `${r.updated} período${r.updated > 1 ? 's' : ''} actualizado${r.updated > 1 ? 's' : ''}${r.skipped ? ` · ${r.skipped} con notas quedaron igual` : ''}` : r.skipped ? 'Los períodos con notas cargadas no se cambian.' : 'Los períodos ya estaban en ese modo.')),
    onError: onErr,
  });
  const updatePeriod = useMutation({ mutationFn: ({ id, ...b }: { id: number; name?: string; kind?: PeriodKind; startDate?: string | null; endDate?: string | null }) => apiSend('PATCH', `/school/periods/${id}`, b), onSuccess: () => (refresh(), toast('Período actualizado')), onError: onErr });

  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data || !level || !form) return <Skeleton count={4} h={90} />;
  const periods = s.data.periods.filter((p) => p.levelId === level.id);
  const dirty = JSON.stringify(form) !== JSON.stringify({ ...level.settings, gradingMode: defaultMode(level) });
  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <div className="stack-lg">
      <p className="small muted">Cada nivel tiene un <b>modo por defecto</b> (solo números, solo letras, informes o mixto) que define su conducción. Después, cada período se puede cambiar igual, mientras no tenga notas cargadas.</p>
      {levels.length > 1 && <Chips value={level.id} onChange={setLevelId} items={levels.map((l) => ({ value: l.id, label: l.name }))} />}

      <Card>
        <div className="stack">
          <h2 className="h2">Modo de calificación · {level.name}</h2>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {(Object.keys(GRADING_MODE_LABELS) as GradingMode[]).map((m) => (
              <button type="button" key={m} className={`chip ${form.gradingMode === m ? 'active' : ''}`} onClick={() => setForm({ ...form, gradingMode: m })}>{GRADING_MODE_LABELS[m]}</button>
            ))}
          </div>
          <p className="small muted">{MODE_HELP[form.gradingMode ?? defaultMode(level)]}</p>

          {form.gradingMode !== 'NARRATIVE' && form.gradingMode !== 'NUMERIC' && (
            <Field label="Escala conceptual (de mejor a peor, separada por comas)" hint="La última es la que se marca en rojo en el boletín.">
              <input className="input" value={form.conceptualScale.join(', ')} onChange={(e) => setForm({ ...form, conceptualScale: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            </Field>
          )}
          {form.gradingMode !== 'NARRATIVE' && form.gradingMode !== 'CONCEPTUAL' && (
            <div className="row wrap" style={{ gap: 12 }}>
              <Field label="Nota mínima"><input className="input" type="number" step="0.5" min={0} max={10} style={{ width: 110 }} value={form.numericMin} onChange={(e) => setForm({ ...form, numericMin: num(e.target.value) })} /></Field>
              <Field label="Nota máxima"><input className="input" type="number" step="0.5" min={1} max={100} style={{ width: 110 }} value={form.numericMax} onChange={(e) => setForm({ ...form, numericMax: num(e.target.value) })} /></Field>
              <Field label="Aprueba con"><input className="input" type="number" step="0.5" min={0} max={100} style={{ width: 110 }} value={form.passingGrade} onChange={(e) => setForm({ ...form, passingGrade: num(e.target.value) })} /></Field>
            </div>
          )}
          <Field label="Valor de cada inasistencia (en faltas)" hint="Ej: una llegada tarde cuenta como media falta.">
            <div className="row wrap" style={{ gap: 12 }}>
              {(['AUSENTE', 'TARDE', 'RETIRO'] as const).map((k) => (
                <label key={k} className="small row" style={{ gap: 6 }}>
                  {k === 'AUSENTE' ? 'Ausente' : k === 'TARDE' ? 'Tarde' : 'Retiro'}
                  <input className="input" type="number" step="0.25" min={0} max={1} style={{ width: 90 }} value={form.attendanceWeights[k]} onChange={(e) => setForm({ ...form, attendanceWeights: { ...form.attendanceWeights, [k]: num(e.target.value) } })} />
                </label>
              ))}
            </div>
          </Field>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" disabled={!dirty || save.isPending || form.conceptualScale.length < 2 || form.numericMax <= form.numericMin} onClick={() => save.mutate(form)}>Guardar</button>
            <button className="btn btn-ghost" disabled={dirty || applyMode.isPending} title="Cambia el tipo de nota de los períodos del ciclo actual que todavía no tienen notas" onClick={() => applyMode.mutate()}><Wand2 size={16} /> Aplicar el modo a los períodos del ciclo</button>
          </div>
          {dirty && <span className="xs muted">Guardá primero para poder aplicar el modo a los períodos.</span>}
        </div>
      </Card>

      <section className="stack">
        <h2 className="h2">Períodos del ciclo · {level.name}</h2>
        <p className="small muted">El tipo de nota de cada período se puede cambiar mientras no tenga notas cargadas. Las fechas pueden superponerse (por ejemplo, la nota de cuatrimestre abarca sus bimestres).</p>
        <div className="card list" style={{ overflow: 'hidden' }}>
          {periods.map((p) => (
            <div key={p.id} className="list-item wrap">
              <div className="grow" style={{ minWidth: 140 }}>
                <div className="h3">{p.name} {p.summaryOf && <Badge tone="warn">Nota de cuatrimestre</Badge>}</div>
                <div className="xs muted">{p.groupName}{p.closedAt && ' · Cerrado'}</div>
              </div>
              <select className="select" style={{ width: 170 }} value={p.kind} disabled={!!p.summaryOf} onChange={(e) => updatePeriod.mutate({ id: p.id, kind: e.target.value as PeriodKind })} aria-label="Tipo de nota">
                {(Object.keys(KIND_LABELS) as PeriodKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
              <input type="date" className="input" style={{ width: 160 }} value={p.startDate ?? ''} onChange={(e) => updatePeriod.mutate({ id: p.id, startDate: e.target.value || null })} aria-label="Inicio" />
              <input type="date" className="input" style={{ width: 160 }} value={p.endDate ?? ''} onChange={(e) => updatePeriod.mutate({ id: p.id, endDate: e.target.value || null })} aria-label="Fin" />
            </div>
          ))}
          {!periods.length && <div className="list-item small muted">Este nivel todavía no tiene períodos en el ciclo actual: aplicá un esquema abajo.</div>}
        </div>
      </section>

      <GradingSchemeCard structure={s.data} />
      <SummaryPeriodsCard structure={s.data} />
    </div>
  );
};
