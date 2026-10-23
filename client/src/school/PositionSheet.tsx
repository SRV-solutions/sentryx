/**
 * Alta y edición de un cargo del legajo (Personal → Editar → Cargos y sueldo, y Legajos).
 *  - El cargo se elige entre los roles de la persona (si es docente, "Docente").
 *  - Horas cátedra y módulos se cargan por módulos (ej: 40 minutos): la hora de fin se calcula sola.
 *  - Docentes: cada franja es una materia que dicta (solo sus asignaciones).
 *  - Una franja se copia a otros días con un toque, y se ve cuántas horas faltan cargar.
 */
import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, X } from 'lucide-react';
import { apiGet, apiSend } from '../lib/api';
import { useSchool } from './SchoolContext';
import { Entity, Action } from './permissions';
import { Field, Sheet, useToast } from '../ui';
import { usePerson } from './PersonProfile';
import type { Structure } from './types';
import {
  DAYS, KIND_LABELS, SHIFTS, SITUATION_LABELS, PAY_MODE_LABELS, RATE_LABELS, monthlyPayOf, money,
  type PayMode, type PositionKind, type PositionSituation, type ScheduleSlot, type StaffPosition,
} from './staffRecords';

export type PositionForm = {
  id?: number;
  userId: number;
  title: string;
  kind: PositionKind;
  situation: PositionSituation;
  weeklyHours: number;
  shift: string;
  levelId: number | '';
  startDate: string;
  endDate: string;
  schedule: ScheduleSlot[];
  notes: string;
  moduleMinutes: number;
  payMode: PayMode;
  rate: number;
};

export const emptyForm = (userId: number): PositionForm => ({ userId, title: '', kind: 'CARGO', situation: 'TITULAR', weeklyHours: 0, shift: 'Mañana', levelId: '', startDate: '', endDate: '', schedule: [], notes: '', moduleMinutes: 40, payMode: 'NONE', rate: 0 });

/** Pasa un cargo guardado al formulario. */
export const formOf = (p: StaffPosition): PositionForm => ({
  id: p.id, userId: p.userId, title: p.title, kind: p.kind, situation: p.situation, weeklyHours: p.weeklyHours, shift: p.shift ?? '', levelId: p.levelId ?? '',
  startDate: p.startDate ?? '', endDate: p.endDate ?? '', schedule: p.schedule, notes: p.notes ?? '', moduleMinutes: p.moduleMinutes ?? 40, payMode: p.payMode ?? 'NONE', rate: p.rate ?? 0,
});

/** "Rectoría · Secundario", "Docente": cómo se nombra un rol como cargo. */
export const roleTitle = (r: { roleLabel: string; level?: string | null }) => `${r.roleLabel}${r.level ? ` · ${r.level}` : ''}`;

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toTime = (min: number) => {
  const v = Math.min(min, 23 * 60 + 59);
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
const usesModules = (kind: PositionKind) => kind !== 'CARGO';
const UNIT: Record<PositionKind, [string, string]> = { CARGO: ['hora reloj', 'horas reloj'], HORAS_CATEDRA: ['hora cátedra', 'horas cátedra'], MODULOS: ['módulo', 'módulos'] };
const unit = (kind: PositionKind, n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${UNIT[kind][n === 1 ? 0 : 1]}`;
const MODULE_PRESETS = [40, 45, 60, 80];

export const PositionSheet = ({ form, onClose, personName }: { form: PositionForm | null; onClose: () => void; personName: string }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSchool();
  // Los montos los carga quien maneja sueldos (Representante Legal, Administración).
  const canPay = can(Entity.PAYROLL, Action.CREATE);
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const person = usePerson(form?.userId ?? null);
  const [f, setF] = useState<PositionForm | null>(form);
  const [error, setError] = useState('');
  const [copying, setCopying] = useState<number | null>(null);
  if (form && (!f || f.id !== form.id || f.userId !== form.userId)) setF(form);

  // Cargos posibles: los roles activos de la persona (más el título que ya tenía, si era otro).
  const roleOptions = useMemo(() => {
    const roles = (person.data?.roles ?? []).filter((r) => r.active);
    return roles.map((r) => ({ value: roleTitle(r), role: r.role as string, levelName: r.level }));
  }, [person.data]);
  const teaching = person.data?.teaching ?? [];
  const isDocente = (x: PositionForm) => roleOptions.find((o) => o.value === x.title)?.role === 'DOCENTE' || x.title === 'Docente';

  const save = useMutation({
    mutationFn: () => {
      const docente = isDocente(f!);
      const schedule = f!.schedule.map((s) => {
        const base = usesModules(f!.kind) ? { day: s.day, from: s.from, to: toTime(toMin(s.from) + modulesOf(s) * f!.moduleMinutes), modules: modulesOf(s) } : { day: s.day, from: s.from, to: s.to };
        const t = docente && s.subjectId ? teaching.find((a) => a.subject.id === s.subjectId && a.division.id === s.divisionId) : undefined;
        return t ? { ...base, subjectId: t.subject.id, divisionId: t.division.id, label: `${t.subject.name} · ${t.division.name}` } : { ...base, label: f!.title };
      });
      const base = { ...f!, schedule, levelId: f!.levelId || null, shift: f!.shift || null, startDate: f!.startDate || null, endDate: f!.endDate || null, notes: f!.notes || null };
      const { payMode, rate, ...noPay } = base;
      const body = canPay ? { ...noPay, payMode, rate } : noPay;
      const { id, userId, ...rest } = body;
      return id ? apiSend('PATCH', `/school/staff-positions/${id}`, rest) : apiSend('POST', '/school/staff-positions', { userId, ...rest });
    },
    onSuccess: () => (toast('Legajo actualizado'), qc.invalidateQueries({ queryKey: ['staff-records'] }), onClose()),
    onError: (e: Error) => setError(e.message),
  });

  if (!form || !f) return null;
  const docente = isDocente(f);
  const modular = usesModules(f.kind);
  function modulesOf(s: ScheduleSlot) {
    return s.modules ?? Math.max(1, Math.round((toMin(s.to) - toMin(s.from)) / (f!.moduleMinutes || 40)));
  }
  const endOf = (s: ScheduleSlot) => (modular ? toTime(toMin(s.from) + modulesOf(s) * f.moduleMinutes) : s.to);
  const setSlot = (i: number, patch: Partial<ScheduleSlot>) => setF({ ...f, schedule: f.schedule.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const removeSlot = (i: number) => (setCopying(null), setF({ ...f, schedule: f.schedule.filter((_x, j) => j !== i) }));
  const addSlot = () => {
    const last = f.schedule[f.schedule.length - 1];
    const slot: ScheduleSlot = last
      ? { ...last, day: last.day >= 5 ? 1 : last.day + 1 }
      : { day: 1, from: '07:30', to: modular ? toTime(toMin('07:30') + 2 * f.moduleMinutes) : '12:00', ...(modular ? { modules: 2 } : {}), ...(docente && teaching[0] ? { subjectId: teaching[0].subject.id, divisionId: teaching[0].division.id } : {}) };
    setF({ ...f, schedule: [...f.schedule, slot] });
  };
  const copyTo = (i: number, day: number) => setF({ ...f, schedule: [...f.schedule, { ...f.schedule[i], day }] });
  const onTitle = (title: string) => {
    const opt = roleOptions.find((o) => o.value === title);
    const levelId = opt?.levelName ? structure.data?.levels.find((l) => l.name === opt.levelName)?.id ?? f.levelId : f.levelId;
    // Un cargo nuevo de docente arranca en horas cátedra.
    const kind = !f.id && opt?.role === 'DOCENTE' && f.kind === 'CARGO' ? 'HORAS_CATEDRA' : f.kind;
    setF({ ...f, title, levelId, kind, payMode: !f.id && canPay && f.payMode === 'NONE' ? (opt?.role === 'DOCENTE' ? 'HORA_CATEDRA' : 'MENSUAL') : f.payMode });
  };

  // Cuánto se cargó en el horario contra las horas semanales del cargo.
  const loaded = modular ? f.schedule.reduce((sum, s) => sum + modulesOf(s), 0) : Math.round((f.schedule.reduce((sum, s) => sum + Math.max(0, toMin(s.to) - toMin(s.from)), 0) / 60) * 10) / 10;
  const missing = Math.round((f.weeklyHours - loaded) * 10) / 10;
  const overlaps = f.schedule.some((a, i) => f.schedule.some((b, j) => j > i && a.day === b.day && toMin(a.from) < toMin(endOf(b)) && toMin(b.from) < toMin(endOf(a))));
  const invalid = f.schedule.some((s) => toMin(endOf(s)) <= toMin(s.from));
  const legacyTitle = f.title && !roleOptions.some((o) => o.value === f.title);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (invalid) return setError('Hay franjas donde la hora de fin no es posterior a la de inicio.');
    if (docente && f.schedule.some((s) => !s.subjectId) && teaching.length) return setError('Elegí la materia de cada franja.');
    save.mutate();
  };

  return (
    <Sheet open={!!form} onClose={onClose} title={`${f.id ? 'Editar' : 'Nuevo'} cargo · ${personName}`} size="lg">
      <form className="stack" onSubmit={submit}>
        <div className="grid grid-3">
          <Field label="Cargo" hint={roleOptions.length ? 'Los roles que tiene en el colegio.' : undefined}>
            {roleOptions.length || person.isLoading ? (
              <select className="select" required value={f.title} onChange={(e) => onTitle(e.target.value)}>
                <option value="">Elegí el cargo</option>
                {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
                {legacyTitle && <option value={f.title}>{f.title} (cargado antes)</option>}
              </select>
            ) : (
              <input className="input" required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            )}
          </Field>
          <Field label="Tipo">
            <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PositionKind })}>
              {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Situación">
            <select className="select" value={f.situation} onChange={(e) => setF({ ...f, situation: e.target.value as PositionSituation })}>
              {Object.entries(SITUATION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label={`${UNIT[f.kind][1][0].toUpperCase()}${UNIT[f.kind][1].slice(1)} por semana`}>
            <input className="input" type="number" min={0} max={80} step={modular ? 1 : 0.5} value={f.weeklyHours} onChange={(e) => setF({ ...f, weeklyHours: Number(e.target.value) })} />
          </Field>
          {modular && (
            <Field label="Duración de cada módulo" hint="Ej: hora cátedra de 40 minutos.">
              <div className="row" style={{ gap: 6 }}>
                <select className="select" value={MODULE_PRESETS.includes(f.moduleMinutes) ? f.moduleMinutes : 'otro'} onChange={(e) => e.target.value !== 'otro' && setF({ ...f, moduleMinutes: Number(e.target.value) })}>
                  {MODULE_PRESETS.map((m) => <option key={m} value={m}>{m} minutos</option>)}
                  <option value="otro">Otra</option>
                </select>
                {!MODULE_PRESETS.includes(f.moduleMinutes) && <input className="input" style={{ width: 80 }} type="number" min={20} max={120} value={f.moduleMinutes} onChange={(e) => setF({ ...f, moduleMinutes: Math.max(20, Math.min(120, Number(e.target.value) || 40)) })} />}
              </div>
            </Field>
          )}
          <Field label="Turno">
            <select className="select" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
              <option value="">—</option>
              {SHIFTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Nivel">
            <select className="select" value={f.levelId} onChange={(e) => setF({ ...f, levelId: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">Toda la institución</option>
              {structure.data?.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Desde"><input className="input" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        </div>

        <div className="card stack" style={{ padding: 12, gap: 10 }}>
          <div className="row-between wrap" style={{ gap: 8 }}>
            <b className="small">Horario semanal{modular ? ` · módulos de ${f.moduleMinutes} min` : ''}</b>
            <span className={`badge ${f.weeklyHours === 0 ? '' : missing === 0 ? 'badge-ok' : missing > 0 ? 'badge-warn' : 'badge-danger'}`}>
              {f.weeklyHours === 0
                ? `Cargaste ${unit(f.kind, loaded)}`
                : missing === 0
                  ? `Completo: ${unit(f.kind, loaded)}`
                  : missing > 0
                    ? `Cargaste ${loaded} de ${unit(f.kind, f.weeklyHours)} · faltan ${missing}`
                    : `Te pasaste por ${unit(f.kind, -missing)}`}
            </span>
          </div>
          {f.weeklyHours === 0 && loaded > 0 && (
            <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setF({ ...f, weeklyHours: loaded })}>Usar {unit(f.kind, loaded)} como total semanal</button>
          )}
          {docente && !person.isLoading && !teaching.length && (
            <div className="alert alert-info xs">Todavía no tiene materias asignadas este ciclo: asignáselas en Administración → Estructura y después elegilas en cada franja.</div>
          )}
          {f.schedule.map((s, i) => (
            <div key={i} className="stack" style={{ gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <div className="row wrap" style={{ gap: 6, alignItems: 'flex-end' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label className="xs">Día</label>
                  <select className="select" style={{ width: 120 }} value={s.day} onChange={(e) => setSlot(i, { day: Number(e.target.value) })}>
                    {DAYS.slice(1).map((d, idx) => <option key={d} value={idx + 1}>{d}</option>)}
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="xs">Desde</label>
                  <input className="input" type="time" style={{ width: 110 }} value={s.from} onChange={(e) => setSlot(i, { from: e.target.value })} />
                </div>
                {modular ? (
                  <>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="xs">Módulos</label>
                      <input className="input" type="number" min={1} max={12} style={{ width: 80 }} value={modulesOf(s)} onChange={(e) => setSlot(i, { modules: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="xs">Hasta</label>
                      <div className="input" style={{ width: 90, display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}>{endOf(s)}</div>
                    </div>
                  </>
                ) : (
                  <div className="field" style={{ margin: 0 }}>
                    <label className="xs">Hasta</label>
                    <input className="input" type="time" style={{ width: 110 }} value={s.to} onChange={(e) => setSlot(i, { to: e.target.value })} />
                  </div>
                )}
                <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
                  <label className="xs">{docente ? 'Materia que dicta' : 'Cargo'}</label>
                  {docente && teaching.length ? (
                    <select className="select" required value={s.subjectId ? `${s.subjectId}:${s.divisionId}` : ''} onChange={(e) => {
                      const [subjectId, divisionId] = e.target.value.split(':').map(Number);
                      setSlot(i, { subjectId: subjectId || undefined, divisionId: divisionId || undefined });
                    }}>
                      <option value="">Elegí la materia</option>
                      {teaching.map((t) => <option key={`${t.subject.id}:${t.division.id}`} value={`${t.subject.id}:${t.division.id}`}>{t.subject.name} · {t.division.name}{t.division.level ? ` (${t.division.level})` : ''}</option>)}
                    </select>
                  ) : (
                    <div className="input truncate" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}>{f.title || 'Elegí el cargo arriba'}</div>
                  )}
                </div>
                <button type="button" className={`btn btn-sm ${copying === i ? '' : 'btn-ghost'}`} title="Copiar esta franja a otros días" onClick={() => setCopying(copying === i ? null : i)}><Copy size={14} /> Copiar</button>
                <button type="button" className="icon-btn" aria-label="Quitar franja" onClick={() => removeSlot(i)}><X size={16} /></button>
              </div>
              {copying === i && (
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="xs muted">Copiar {s.from}–{endOf(s)} a:</span>
                  {DAYS.slice(1).map((d, idx) => {
                    const day = idx + 1;
                    const has = f.schedule.some((x) => x.day === day && x.from === s.from && endOf(x) === endOf(s));
                    return (
                      <button key={d} type="button" className={`chip ${has ? 'active' : ''}`} disabled={has} onClick={() => copyTo(i, day)}>{has ? '✓ ' : ''}{d}</button>
                    );
                  })}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCopying(null)}>Listo</button>
                </div>
              )}
            </div>
          ))}
          {overlaps && <div className="xs" style={{ color: 'var(--danger)' }}>Hay franjas que se superponen el mismo día.</div>}
          <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={addSlot}><Plus size={14} /> Agregar franja</button>
        </div>

        {canPay && (
          <div className="card" style={{ padding: 12, background: 'var(--surface-2)' }}>
            <div className="stack" style={{ gap: 8 }}>
              <b className="small">Sueldo de este cargo</b>
              <div className="grid grid-2">
                <Field label="Cómo se calcula">
                  <select className="select" value={f.payMode} onChange={(e) => setF({ ...f, payMode: e.target.value as PayMode })}>
                    {(Object.keys(PAY_MODE_LABELS) as PayMode[]).map((m) => <option key={m} value={m}>{PAY_MODE_LABELS[m]}</option>)}
                  </select>
                </Field>
                {f.payMode !== 'NONE' && (
                  <Field label={RATE_LABELS[f.payMode]}><input className="input" type="number" min={0} step={1} value={f.rate} onChange={(e) => setF({ ...f, rate: Number(e.target.value) })} /></Field>
                )}
              </div>
              {f.payMode !== 'NONE' && (
                <div className="small">
                  Cobra por mes (bruto, antes de descuentos): <b>{money(monthlyPayOf(f))}</b>
                  {f.payMode !== 'MENSUAL' && <span className="xs muted"> · {f.weeklyHours} h semanales{f.payMode === 'HORA_RELOJ' ? ' × 4,33 semanas' : ''} × {money(f.rate)}</span>}
                </div>
              )}
            </div>
          </div>
        )}
        <Field label="Observaciones"><textarea className="textarea" rows={2} maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {error && <div className="alert alert-danger small">{error}</div>}
        <button className="btn btn-block" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Sheet>
  );
};
