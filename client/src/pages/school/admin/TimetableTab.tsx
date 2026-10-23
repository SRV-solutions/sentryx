/** Administración → Horarios: entrada, duración del módulo y recreos de cada nivel. */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coffee, Plus, X } from 'lucide-react';
import { apiGet, apiSend } from '../../../lib/api';
import { useSchool } from '../../../school/SchoolContext';
import { Card, Chips, Field, Skeleton, useToast } from '../../../ui';
import type { Structure } from '../../../school/types';
import { SHIFTS } from '../../../school/staffRecords';
import { DEFAULT_TIMETABLE, expandModules, timetableOf, type Timetable } from '../../../school/timetable';

export const TimetableTab = () => {
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useSchool();
  const s = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure') });
  const scopeIds = new Set(session?.levels.map((l) => l.id) ?? []);
  const levels = s.data?.levels.filter((l) => scopeIds.has(l.id)) ?? [];
  const [levelId, setLevelId] = useState<number | null>(null);
  const level = levels.find((l) => l.id === (levelId ?? levels[0]?.id));
  const [tt, setTt] = useState<Timetable | null>(null);
  const [previewShift, setPreviewShift] = useState('');
  useEffect(() => setTt(level ? { ...DEFAULT_TIMETABLE, ...(timetableOf(level) ?? {}) } : null), [level?.id, s.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => apiSend('PATCH', `/school/levels/${level!.id}`, { settings: { timetable: { ...tt!, breaks: [...tt!.breaks].sort((a, b) => a.from.localeCompare(b.from)) } } }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['structure'] }), toast('Horario guardado: los horarios del personal ya lo usan')),
    onError: (e: Error) => toast(e.message, true),
  });

  if (s.isLoading || !tt || !level) return <Skeleton count={3} h={80} />;
  const setBreak = (i: number, patch: Partial<Timetable['breaks'][number]>) => setTt({ ...tt, breaks: tt.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const preview = expandModules(tt.start ?? '07:30', 8, tt.moduleMinutes, tt.breaks, previewShift || null).pieces;
  let n = 0;

  return (
    <div className="stack">
      {levels.length > 1 && <Chips value={level.id} onChange={(v) => setLevelId(v)} items={levels.map((l) => ({ value: l.id, label: l.name }))} />}
      <Card>
        <div className="stack">
          <div>
            <h2 className="h2">Horario de {level.name}</h2>
            <p className="small muted">Con esto, al cargar las horas de un docente (ej: 4 módulos desde las 7:30) la hora de fin saltea sola los recreos, y en Mi legajo y en las fichas el horario se ve módulo por módulo con los recreos.</p>
          </div>
          <div className="grid grid-3">
            <Field label="Entrada"><input className="input" type="time" value={tt.start ?? ''} onChange={(e) => setTt({ ...tt, start: e.target.value || undefined })} /></Field>
            <Field label="Duración del módulo (minutos)" hint="Hora cátedra: 40 en Secundario, 40 o 60 en Primario."><input className="input" type="number" min={20} max={120} value={tt.moduleMinutes} onChange={(e) => setTt({ ...tt, moduleMinutes: Math.max(20, Math.min(120, Number(e.target.value) || 40)) })} /></Field>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <b className="small row" style={{ gap: 6 }}><Coffee size={16} /> Recreos</b>
            {!tt.breaks.length && <p className="xs muted">Todavía no hay recreos cargados.</p>}
            {tt.breaks.map((b, i) => (
              <div key={i} className="row wrap" style={{ gap: 6, alignItems: 'flex-end' }}>
                <div className="field" style={{ margin: 0 }}><label className="xs">Desde</label><input className="input" type="time" style={{ width: 110 }} value={b.from} onChange={(e) => setBreak(i, { from: e.target.value })} /></div>
                <div className="field" style={{ margin: 0 }}><label className="xs">Minutos</label><input className="input" type="number" min={5} max={120} style={{ width: 90 }} value={b.minutes} onChange={(e) => setBreak(i, { minutes: Math.max(5, Math.min(120, Number(e.target.value) || 10)) })} /></div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="xs">Turno</label>
                  <select className="select" style={{ width: 150 }} value={b.shift ?? ''} onChange={(e) => setBreak(i, { shift: e.target.value || null })}>
                    <option value="">Todos</option>
                    {SHIFTS.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div className="field" style={{ margin: 0, flex: '1 1 140px' }}><label className="xs">Nombre (opcional)</label><input className="input" maxLength={40} placeholder="Recreo" value={b.label ?? ''} onChange={(e) => setBreak(i, { label: e.target.value || undefined })} /></div>
                <button type="button" className="icon-btn" aria-label="Quitar recreo" onClick={() => setTt({ ...tt, breaks: tt.breaks.filter((_x, j) => j !== i) })}><X size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => {
              const last = tt.breaks[tt.breaks.length - 1];
              // Sugerencia: después de 2 módulos más que el último recreo (o de 2 desde la entrada).
              const at = expandModules(last ? last.from : tt.start ?? '07:30', last ? 3 : 2, tt.moduleMinutes, tt.breaks).end;
              setTt({ ...tt, breaks: [...tt.breaks, { from: at, minutes: 10 }] });
            }}><Plus size={14} /> Agregar recreo</button>
          </div>
          <div className="card stack" style={{ padding: 12, gap: 6, background: 'var(--surface-2)' }}>
            <div className="row-between wrap" style={{ gap: 6 }}>
              <b className="small">Así queda el día</b>
              <select className="select" style={{ width: 170, minHeight: 34 }} value={previewShift} onChange={(e) => setPreviewShift(e.target.value)}>
                <option value="">Todos los turnos</option>
                {SHIFTS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div className="row wrap" style={{ gap: 4 }}>
              {preview.map((p, i) => (
                <span key={i} className={`badge ${p.kind === 'break' ? 'badge-warn' : ''}`}>
                  {p.kind === 'break' ? `☕ ${p.label}` : `Módulo ${++n}`} {p.from}–{p.to}
                </span>
              ))}
            </div>
          </div>
          <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Guardando…' : 'Guardar horario'}</button>
        </div>
      </Card>
    </div>
  );
};
