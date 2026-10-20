/** Administración → Estructura: estructura por defecto, esquema de evaluación y edición de cursos. */
import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Wand2, CalendarRange, Pencil, Trash2 } from 'lucide-react';
import { apiGet, apiSend } from '../../../lib/api';
import { Card, Field, Sheet, useToast, Badge } from '../../../ui';
import type { Structure, Division } from '../../../school/types';

type Scheme = 'TRIMESTRAL' | 'BIMESTRAL';
interface Range { startDate: string; endDate: string }

/** Para colegios nuevos: crea de una vez salas, grados y años (y materias habituales). */
export const DefaultStructureCard = ({ structure }: { structure: Structure }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState({ primaryYears: 6 as 6 | 7, secondaryYears: 6 as 5 | 6, sections: 'A', shift: 'Mañana', createSubjects: true });
  const hasSecondary = structure.levels.some((l) => l.type === 'SECUNDARIO');
  const hasPrimary = structure.levels.some((l) => l.type === 'PRIMARIO');
  const create = useMutation({
    mutationFn: () =>
      apiSend<{ divisionsCreated: number; subjectsCreated: number }>('POST', '/school/structure/defaults', {
        ...options,
        sections: options.sections.split(',').map((x) => x.trim()).filter(Boolean),
      }),
    onSuccess: (r) => {
      toast(r.divisionsCreated || r.subjectsCreated ? `Se crearon ${r.divisionsCreated} cursos y ${r.subjectsCreated} materias` : 'No hacía falta crear nada: ya estaban todos.');
      qc.invalidateQueries({ queryKey: ['structure'] });
      setOpen(false);
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const empty = structure.divisions.length === 0;

  return (
    <>
      <Card>
        <div className="row wrap" style={{ gap: 12 }}>
          <Wand2 size={22} className="accent" />
          <div className="grow" style={{ minWidth: 200 }}>
            <div className="h3">{empty ? 'Armá la estructura del colegio en un paso' : 'Estructura por defecto'}</div>
            <div className="xs muted">Crea las salas de Inicial, los grados de Primaria y los años de Secundaria (y sus materias habituales). No duplica lo que ya existe.</div>
          </div>
          <button className={`btn btn-sm ${empty ? 'btn-accent' : 'btn-ghost'}`} onClick={() => setOpen(true)}>Crear estructura</button>
        </div>
      </Card>
      <Sheet open={open} onClose={() => setOpen(false)} title="Estructura por defecto">
        <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), create.mutate())}>
          <p className="small muted">Inicial: Sala de 3, 4 y 5. Después podés renombrar, borrar o agregar cursos a mano.</p>
          {hasPrimary && (
            <Field label="Años de Primaria">
              <div className="chips">
                {[6, 7].map((n) => <button type="button" key={n} className={`chip ${options.primaryYears === n ? 'active' : ''}`} onClick={() => setOptions({ ...options, primaryYears: n as 6 | 7 })}>{n} grados</button>)}
              </div>
            </Field>
          )}
          {hasSecondary && (
            <Field label="Años de Secundaria">
              <div className="chips">
                {[5, 6].map((n) => <button type="button" key={n} className={`chip ${options.secondaryYears === n ? 'active' : ''}`} onClick={() => setOptions({ ...options, secondaryYears: n as 5 | 6 })}>{n} años</button>)}
              </div>
            </Field>
          )}
          <Field label="Secciones por grado" hint='Separadas por coma. Ej: "A" o "A, B" (con una sola no se agrega letra al nombre).'>
            <input className="input" value={options.sections} onChange={(e) => setOptions({ ...options, sections: e.target.value })} />
          </Field>
          <Field label="Turno">
            <select className="select" value={options.shift} onChange={(e) => setOptions({ ...options, shift: e.target.value })}>
              {['Mañana', 'Tarde', 'Vespertino', 'Jornada completa'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <label className="row small"><input type="checkbox" checked={options.createSubjects} onChange={(e) => setOptions({ ...options, createSubjects: e.target.checked })} /> Crear también las materias habituales de cada nivel</label>
          <button className="btn btn-accent btn-block" disabled={create.isPending}>{create.isPending ? 'Creando…' : 'Crear'}</button>
        </form>
      </Sheet>
    </>
  );
};

/** Esquema de evaluación (trimestral / bimestral) con fechas, para todos los niveles o los elegidos. */
export const GradingSchemeCard = ({ structure }: { structure: Structure }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [scheme, setScheme] = useState<Scheme>('TRIMESTRAL');
  const [ranges, setRanges] = useState<Range[]>([]);
  const [levelIds, setLevelIds] = useState<number[]>(structure.levels.map((l) => l.id));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    apiGet<{ ranges: Range[] }>(`/school/periods/suggested-ranges?scheme=${scheme}`)
      .then((r) => setRanges(r.ranges))
      .catch((e: Error) => setError(e.message));
  }, [open, scheme]);

  const apply = useMutation({
    mutationFn: () => apiSend<{ summary: Array<{ level: string; result: string }> }>('POST', '/school/periods/scheme', { scheme, ranges, levelIds }),
    onSuccess: (r) => {
      toast(`Esquema aplicado: ${r.summary.map((x) => `${x.level} (${x.result})`).join(', ')}`);
      qc.invalidateQueries({ queryKey: ['structure'] });
      setOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });
  const unit = scheme === 'TRIMESTRAL' ? 'Trimestre' : 'Bimestre';
  const currentCounts = structure.levels.map((l) => `${l.name}: ${structure.periods.filter((p) => p.levelId === l.id).length} períodos`).join(' · ');

  return (
    <>
      <Card>
        <div className="row wrap" style={{ gap: 12 }}>
          <CalendarRange size={22} className="accent" />
          <div className="grow" style={{ minWidth: 200 }}>
            <div className="h3">Períodos de evaluación</div>
            <div className="xs muted">Trimestral o bimestral, con fechas desde/hasta, para todos los niveles. Hoy: {currentCounts}.</div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => (setError(''), setOpen(true))}>Configurar</button>
        </div>
      </Card>
      <Sheet open={open} onClose={() => setOpen(false)} title="Períodos de evaluación">
        <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), setError(''), apply.mutate())}>
          <Field label="Esquema">
            <div className="chips">
              {(['TRIMESTRAL', 'BIMESTRAL'] as Scheme[]).map((s) => (
                <button type="button" key={s} className={`chip ${scheme === s ? 'active' : ''}`} onClick={() => setScheme(s)}>{s === 'TRIMESTRAL' ? '3 trimestres' : '4 bimestres'}</button>
              ))}
            </div>
          </Field>
          <p className="xs muted">
            {scheme === 'BIMESTRAL'
              ? 'Secundario: el 1º bimestre de cada cuatrimestre se califica conceptual y el 2º numérico. Primario: conceptual. Inicial: informes.'
              : 'Secundario: notas numéricas. Primario: conceptual. Inicial: informes.'}
          </p>
          <Field label="Niveles">
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              {structure.levels.map((l) => (
                <button type="button" key={l.id} className={`chip ${levelIds.includes(l.id) ? 'active' : ''}`} onClick={() => setLevelIds(levelIds.includes(l.id) ? levelIds.filter((x) => x !== l.id) : [...levelIds, l.id])}>{l.name}</button>
              ))}
            </div>
          </Field>
          <div className="stack" style={{ gap: 8 }}>
            {ranges.map((range, i) => (
              <div key={i} className="row wrap" style={{ gap: 8 }}>
                <span className="small" style={{ width: 100, fontWeight: 700 }}>{i + 1}º {unit}</span>
                <label className="row xs" style={{ gap: 4 }}>Desde<input type="date" className="input" style={{ width: 150 }} value={range.startDate} onChange={(e) => setRanges(ranges.map((r, j) => (j === i ? { ...r, startDate: e.target.value } : r)))} /></label>
                <label className="row xs" style={{ gap: 4 }}>Hasta<input type="date" className="input" style={{ width: 150 }} value={range.endDate} onChange={(e) => setRanges(ranges.map((r, j) => (j === i ? { ...r, endDate: e.target.value } : r)))} /></label>
              </div>
            ))}
          </div>
          <div className="alert alert-info xs">Si un nivel ya tiene notas cargadas, solo se actualizan nombres y fechas; la cantidad de períodos no se puede cambiar a mitad de año.</div>
          {error && <div className="alert alert-danger small">{error}</div>}
          <button className="btn btn-accent btn-block" disabled={apply.isPending || !levelIds.length || !ranges.length}>{apply.isPending ? 'Aplicando…' : 'Aplicar a los niveles elegidos'}</button>
        </form>
      </Sheet>
    </>
  );
};

/** Editar (o eliminar, si nunca tuvo alumnos) un curso. */
/**
 * Nota de cuatrimestre: agrega a cada cuatrimestre del nivel una nota de cierre (numérica) que carga la
 * docente, además de las de los bimestres. Sus fechas abarcan el cuatrimestre entero: se superponen a propósito.
 */
export const SummaryPeriodsCard = ({ structure }: { structure: Structure }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const levels = structure.levels.filter((l) => structure.periods.some((p) => p.levelId === l.id && p.groupName));
  const act = useMutation({
    mutationFn: ({ levelId, remove }: { levelId: number; remove: boolean }) => apiSend(remove ? 'DELETE' : 'POST', '/school/periods/summaries', { levelId }),
    onSuccess: (_r, v) => (toast(v.remove ? 'Notas de cuatrimestre quitadas' : 'Notas de cuatrimestre agregadas: ya aparecen en la planilla y el boletín'), qc.invalidateQueries({ queryKey: ['structure'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  if (!levels.length) return null;
  return (
    <section className="card card-pad stack">
      <div>
        <h2 className="h3">Nota de cuatrimestre</h2>
        <p className="small muted">Además de las notas de cada bimestre, una nota de cierre por cuatrimestre (1º y 2º) que carga la docente. La final anual pasa a ser el promedio de esas dos. Las fechas se superponen con las de los bimestres: es normal.</p>
      </div>
      {levels.map((l) => {
        const has = structure.periods.some((p) => p.levelId === l.id && p.summaryOf);
        return (
          <div key={l.id} className="row-between wrap">
            <span className="small"><b>{l.name}</b> · {has ? 'con nota de cuatrimestre' : 'solo bimestres'}</span>
            <button className={`btn btn-sm ${has ? 'btn-ghost' : ''}`} disabled={act.isPending} onClick={() => act.mutate({ levelId: l.id, remove: has })}>{has ? 'Quitar' : 'Agregar'}</button>
          </div>
        );
      })}
    </section>
  );
};

export const EditDivisionButton = ({ division }: { division: Division }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: division.name, gradeYear: division.gradeYear ?? 1, shift: division.shift ?? 'Mañana' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['structure'] });
  const save = useMutation({
    mutationFn: () => apiSend('PATCH', `/school/divisions/${division.id}`, form),
    onSuccess: () => (refresh(), toast('Curso actualizado'), setOpen(false)),
    onError: (e: Error) => toast(e.message, true),
  });
  const remove = useMutation({
    mutationFn: () => apiSend('DELETE', `/school/divisions/${division.id}`),
    onSuccess: () => (refresh(), toast('Curso eliminado'), setOpen(false)),
    onError: (e: Error) => toast(e.message, true),
  });
  const hasStudents = Number(division.studentCount ?? 0) > 0;
  return (
    <>
      <button className="icon-btn" aria-label={`Editar ${division.name}`} onClick={() => setOpen(true)}><Pencil size={16} /></button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Editar ${division.name}`}>
        <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), save.mutate())}>
          <Field label="Nombre"><input className="input" required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Año / grado" hint="Ordena la promoción anual (ej: 4 para 4º grado)."><input className="input" type="number" min={0} max={7} value={form.gradeYear} onChange={(e) => setForm({ ...form, gradeYear: Number(e.target.value) })} /></Field>
            <Field label="Turno">
              <select className="select" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
                {['Mañana', 'Tarde', 'Vespertino', 'Jornada completa'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </div>
          <button className="btn btn-block" disabled={save.isPending}>Guardar</button>
          <div className="row-between">
            <span className="xs muted">{hasStudents ? <Badge>{division.studentCount} alumnos: no se puede eliminar</Badge> : 'Sin alumnos: se puede eliminar.'}</span>
            <button type="button" className="btn btn-sm btn-ghost" disabled={hasStudents || remove.isPending} onClick={() => remove.mutate()}><Trash2 size={14} /> Eliminar</button>
          </div>
        </form>
      </Sheet>
    </>
  );
};
