/**
 * Materias por año (Administración → Estructura): cada curso ve solo las materias de su año, más las
 * comunes a todo el nivel. Se crean en uno o varios años a la vez, se copian de un año a otro y se
 * cambian de año o de nombre.
 */
import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus } from 'lucide-react';
import { apiSend } from '../lib/api';
import { Chips, Field, Sheet, useToast } from '../ui';
import type { Division, Level, Structure, Subject } from './types';

/** "1º año", "3º grado", "Sala de 4". */
export const yearLabel = (type: Level['type'] | undefined, y: number) =>
  type === 'INICIAL' ? (y ? `Sala de ${y}` : 'Sala') : type === 'PRIMARIO' ? `${y}º grado` : `${y}º año`;

/** Materias de un curso: las de su año y las comunes a todo el nivel. */
export const subjectsForDivision = (subjects: Subject[], d: Pick<Division, 'levelId' | 'gradeYear'>) =>
  subjects.filter((s) => s.levelId === d.levelId && (s.gradeYear === null || s.gradeYear === undefined || s.gradeYear === d.gradeYear));

/** Años con cursos en ese nivel (ej: 1 a 5). */
export const levelYears = (structure: Pick<Structure, 'divisions'>, levelId: number) =>
  [...new Set(structure.divisions.filter((d) => d.levelId === levelId).map((d) => d.gradeYear ?? 0))].sort((a, b) => a - b);

type Tab = 'all' | number;

export const SubjectsEditor = ({ level, structure }: { level: Level; structure: Structure }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const years = useMemo(() => levelYears(structure, level.id), [structure, level.id]);
  const [tab, setTab] = useState<Tab>(years[0] ?? 'all');
  const [name, setName] = useState('');
  const [targets, setTargets] = useState<number[] | null>(null);
  const [copyTo, setCopyTo] = useState<number[]>([]);
  const [editing, setEditing] = useState<Subject | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['structure'] });
  const onErr = (e: Error) => toast(e.message, true);
  const all = structure.subjects.filter((s) => s.levelId === level.id);
  const common = all.filter((s) => s.gradeYear === null || s.gradeYear === undefined);
  const list = tab === 'all' ? common : all.filter((s) => s.gradeYear === tab);
  const chosen = targets ?? (tab === 'all' ? [] : [tab]);
  const label = (y: number) => yearLabel(level.type, y);

  const create = useMutation({
    mutationFn: () => apiSend<{ created: Subject[]; skipped: string[] }>('POST', '/school/subjects', { levelId: level.id, name: name.trim(), ...(chosen.length ? { gradeYears: chosen } : { gradeYear: null }) }),
    onSuccess: (r) => (refresh(), setName(''), toast(`Materia creada${r.created.length > 1 ? ` en ${r.created.length} años` : ''}${r.skipped.length ? ` (ya existía en ${r.skipped.join(', ')})` : ''}`)),
    onError: onErr,
  });
  const splitAll = useMutation({
    mutationFn: () => apiSend<{ subjects: number }>('POST', '/school/subjects/split-level', { levelId: level.id }),
    onSuccess: (r) => (refresh(), setTab(years[0] ?? 'all'), toast(`Listo: ${r.subjects} materias separadas por año, con sus docentes, notas y horarios`)),
    onError: onErr,
  });
  const copy = useMutation({
    mutationFn: () => apiSend<{ created: number }>('POST', '/school/subjects/copy', { levelId: level.id, fromYear: tab === 'all' ? null : tab, toYears: copyTo }),
    onSuccess: (r) => (refresh(), setCopyTo([]), toast(r.created ? `Se copiaron ${r.created} materias` : 'Ya estaban todas: no se duplicó nada')),
    onError: onErr,
  });

  return (
    <section className="stack">
      <div className="row-between wrap" style={{ gap: 8 }}>
        <h2 className="h2">Materias</h2>
        <span className="xs muted">Cada curso muestra solo las materias de su año (y las comunes a todos los años).</span>
      </div>
      <Chips
        value={tab}
        onChange={(v) => (setTab(v), setTargets(null), setCopyTo([]))}
        items={[
          ...years.map((y) => ({ value: y as Tab, label: `${label(y)} (${all.filter((s) => s.gradeYear === y).length})` })),
          { value: 'all' as Tab, label: `Comunes a todos (${common.length})` },
        ]}
      />
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {list.map((x) => (
          <button key={x.id} type="button" className="chip" title="Editar nombre o año" onClick={() => setEditing(x)}>{x.name}</button>
        ))}
        {!list.length && <span className="small muted">{tab === 'all' ? 'No hay materias comunes a todos los años.' : `Todavía no hay materias de ${label(tab)}.`}</span>}
      </div>
      {tab === 'all' && common.length > 0 && years.length > 1 && (
        <div className="alert alert-info small" style={{ alignItems: 'center' }}>
          <div className="grow">
            <b>¿Cada año tiene sus materias?</b> "Separar por año" crea {common.length === 1 ? 'esta materia' : `estas ${common.length} materias`} en cada año ({years.map(label).join(', ')}) y mueve a cada una los docentes, notas, publicaciones y horarios de los cursos de ese año. Después podés renombrarlas o quitar las que no correspondan.
          </div>
          <button type="button" className="btn btn-sm" disabled={splitAll.isPending} onClick={() => window.confirm('¿Separar todas las materias comunes por año? No se pierde nada.') && splitAll.mutate()}>{splitAll.isPending ? 'Separando…' : 'Separar todas por año'}</button>
        </div>
      )}
      {tab !== 'all' && common.length > 0 && (
        <p className="xs muted" style={{ margin: 0 }}>También aparecen en {label(tab)} las comunes a todos los años: {common.map((s) => s.name).join(', ')}.</p>
      )}

      <form className="card stack" style={{ padding: 12, gap: 8 }} onSubmit={(e: FormEvent) => (e.preventDefault(), name.trim().length >= 2 && create.mutate())}>
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input grow" style={{ minWidth: 200 }} placeholder="Nueva materia (ej: Matemática)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={name.trim().length < 2 || create.isPending}><Plus size={18} /> Crear</button>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="xs muted">En:</span>
          {years.map((y) => {
            const on = chosen.includes(y);
            return <button key={y} type="button" className={`chip ${on ? 'active' : ''}`} onClick={() => setTargets(on ? chosen.filter((x) => x !== y) : [...chosen, y])}>{label(y)}</button>;
          })}
          <button type="button" className={`chip ${!chosen.length ? 'active' : ''}`} onClick={() => setTargets([])}>Todos los años (común)</button>
        </div>
      </form>

      {list.length > 0 && years.length > 1 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="xs muted"><Copy size={12} /> Copiar estas materias a:</span>
          {years.filter((y) => y !== tab).map((y) => {
            const on = copyTo.includes(y);
            return <button key={y} type="button" className={`chip ${on ? 'active' : ''}`} onClick={() => setCopyTo(on ? copyTo.filter((x) => x !== y) : [...copyTo, y])}>{label(y)}</button>;
          })}
          <button type="button" className="btn btn-sm" disabled={!copyTo.length || copy.isPending} onClick={() => copy.mutate()}>Copiar</button>
        </div>
      )}

      {editing && <SubjectEditSheet subject={editing} years={years} label={label} onClose={() => setEditing(null)} />}
    </section>
  );
};

const SubjectEditSheet = ({ subject, years, label, onClose }: { subject: Subject; years: number[]; label: (y: number) => string; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(subject.name);
  const [year, setYear] = useState<number | ''>(subject.gradeYear ?? '');
  const split = useMutation({
    mutationFn: () => apiSend<{ years: number }>('POST', `/school/subjects/${subject.id}/split`),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ['structure'] }), toast(`"${subject.name}" ahora está en ${r.years} años, con sus docentes y notas`), onClose()),
    onError: (e: Error) => toast(e.message, true),
  });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend('PATCH', `/school/subjects/${subject.id}`, body),
    onSuccess: (_r, body) => (qc.invalidateQueries({ queryKey: ['structure'] }), toast(body.active === false ? 'Materia quitada' : 'Materia actualizada'), onClose()),
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <Sheet open onClose={onClose} title={`Materia: ${subject.name}`}>
      <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), save.mutate({ name: name.trim(), gradeYear: year === '' ? null : year }))}>
        <Field label="Nombre"><input className="input" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Año" hint="Si la pasás a un año, deja de aparecer en los cursos de los otros años.">
          <select className="select" value={year} onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Todos los años (común)</option>
            {years.map((y) => <option key={y} value={y}>{label(y)}</option>)}
          </select>
        </Field>
        <button className="btn btn-block" disabled={save.isPending}>Guardar</button>
        {(subject.gradeYear === null || subject.gradeYear === undefined) && years.length > 1 && (
          <button type="button" className="btn btn-ghost btn-block" disabled={split.isPending} onClick={() => split.mutate()}>Separar por año (una "{subject.name}" en cada año, con sus docentes y notas)</button>
        )}
        <button type="button" className="btn btn-ghost btn-block" disabled={save.isPending} onClick={() => window.confirm(`¿Quitar "${subject.name}"? Las notas cargadas se conservan.`) && save.mutate({ active: false })}>Quitar materia</button>
      </form>
    </Sheet>
  );
};
