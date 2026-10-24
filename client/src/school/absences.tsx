/**
 * Ausencias docentes: registrar (la propia o, para preceptoría/conducción, la de otros), listar y
 * horario del curso en el aula con las ausencias marcadas.
 */
import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX2, Coffee, Trash2, UserX } from 'lucide-react';
import { apiGet, apiSend } from '../lib/api';
import { Chips, Field, Sheet, Skeleton, useToast } from '../ui';
import { useSchool } from './SchoolContext';
import { useAuth } from '../context/AuthContext';
import { Entity, Action } from './permissions';
import { DAYS } from './staffRecords';
import { breaksBetween, expandModules, toMin, type Timetable } from './timetable';

export interface Absence {
  id: number;
  date: string;
  endDate: string | null;
  fromTime: string | null;
  toTime: string | null;
  note: string;
  substitute: string | null;
  teacher: { id: number; name: string } | null;
  divisions: Array<{ id: number; name: string; subjects: string[] }>;
  canDelete: boolean;
}

export const useManagesAbsences = () => {
  const { can, session } = useSchool();
  // Preceptoría, conducción, secretaría y administración (cada docente, solo la propia).
  return !!session?.roles.some((r) => r === 'PRECEPTOR' || r === 'JEFE_PRECEPTORES') || can(Entity.STAFF_RECORDS, Action.UPDATE) || can(Entity.SCHOOL, Action.UPDATE);
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => iso(new Date());
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
export const absenceWhen = (a: Pick<Absence, 'date' | 'endDate' | 'fromTime' | 'toTime'>) => {
  const text = `${dayLabel(a.date)}${a.endDate ? ` al ${dayLabel(a.endDate)}` : ''}${a.fromTime ? ` · de ${a.fromTime} a ${a.toTime}` : ' · todo el día'}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const covers = (a: Absence, date: string) => date >= a.date && date <= (a.endDate ?? a.date);
const overlapsTime = (a: Absence, from: string, to: string) => !a.fromTime || (toMin(a.fromTime) < toMin(to) && toMin(from) < toMin(a.toTime ?? '23:59'));

export const useAbsences = (params: { from?: string; to?: string; divisionId?: number }) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
  return useQuery({ queryKey: ['teacher-absences', qs], queryFn: () => apiGet<Absence[]>(`/school/teacher-absences${qs ? `?${qs}` : ''}`) });
};

/** Tarjeta de una ausencia (aula, calendario, Mi legajo). */
export const AbsenceItem = ({ a, showDivisions = true }: { a: Absence; showDivisions?: boolean }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const del = useMutation({
    mutationFn: () => apiSend('DELETE', `/school/teacher-absences/${a.id}`),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['teacher-absences'] }), toast('Ausencia quitada')),
    onError: (e: Error) => toast(e.message, true),
  });
  const isToday = covers(a, todayIso());
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: isToday ? 'var(--warn-bg, rgba(246,149,10,.12))' : 'var(--surface-2)' }}>
      <UserX size={18} style={{ color: 'var(--brand-orange, #F6950A)', flexShrink: 0, marginTop: 2 }} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small"><b>{isToday ? 'Hoy falta ' : 'Falta '}{a.teacher?.name}</b></div>
        <div className="xs muted">{absenceWhen(a)}</div>
        {showDivisions && a.divisions.length > 0 && <div className="xs">{a.divisions.map((d) => `${d.subjects.join(', ')} · ${d.name}`).join(' / ')}</div>}
        {a.substitute && <div className="xs">Reemplazo: <b>{a.substitute}</b></div>}
        {a.note && <div className="xs muted">{a.note}</div>}
      </div>
      {a.canDelete && <button className="icon-btn" aria-label="Quitar ausencia" disabled={del.isPending} onClick={() => window.confirm('¿Quitar esta ausencia?') && del.mutate()}><Trash2 size={15} /></button>}
    </div>
  );
};

/** Registrar una ausencia: la propia (docente) o la de otra persona (preceptoría, conducción, administración). */
export const AbsenceSheet = ({ open, onClose, teachers, defaultTeacherId }: { open: boolean; onClose: () => void; teachers?: Array<{ id: number; name: string }>; defaultTeacherId?: number }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const manages = useManagesAbsences();
  const [f, setF] = useState({ teacherId: defaultTeacherId ?? 0, date: todayIso(), endDate: '', allDay: true, fromTime: '07:30', toTime: '09:30', substitute: '', note: '', notify: true });
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () =>
      apiSend('POST', '/school/teacher-absences', {
        ...(f.teacherId ? { teacherId: f.teacherId } : {}),
        date: f.date,
        endDate: f.endDate || null,
        fromTime: f.allDay ? null : f.fromTime,
        toTime: f.allDay ? null : f.toTime,
        substitute: f.substitute || null,
        note: f.note,
        notify: f.notify,
      }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['teacher-absences'] }), toast(f.notify ? 'Ausencia registrada: les avisamos a estudiantes y familias' : 'Ausencia registrada'), onClose()),
    onError: (e: Error) => setError(e.message),
  });
  const choose = manages && !!teachers?.length;
  return (
    <Sheet open={open} onClose={onClose} title="Registrar una ausencia docente">
      <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), setError(''), save.mutate())}>
        {choose ? (
          <Field label="Docente">
            <select className="select" value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: Number(e.target.value) })}>
              <option value={0}>Yo</option>
              {teachers!.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Avisás tu propia ausencia: les llega a los estudiantes y familias de tus cursos.</p>
        )}
        <div className="grid grid-2">
          <Field label="Día"><input className="input" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Hasta (si son varios días)"><input className="input" type="date" min={f.date} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        </div>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} /> Todo el día</label>
        {!f.allDay && (
          <div className="grid grid-2">
            <Field label="Desde"><input className="input" type="time" value={f.fromTime} onChange={(e) => setF({ ...f, fromTime: e.target.value })} /></Field>
            <Field label="Hasta"><input className="input" type="time" value={f.toTime} onChange={(e) => setF({ ...f, toTime: e.target.value })} /></Field>
          </div>
        )}
        <Field label="Reemplazo (opcional)"><input className="input" maxLength={120} placeholder='Ej: "Prof. Gómez" u "Hora libre"' value={f.substitute} onChange={(e) => setF({ ...f, substitute: e.target.value })} /></Field>
        <Field label="Mensaje (opcional)"><textarea className="textarea" rows={2} maxLength={500} placeholder="Ej: traer la tarea el jueves" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} /> Avisar a estudiantes y familias de los cursos (notificación)</label>
        {error && <div className="alert alert-danger small">{error}</div>}
        <button className="btn btn-block" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Registrar ausencia'}</button>
      </form>
    </Sheet>
  );
};

interface TimetableSlot { day: number; from: string; to: string; modules: number | null; moduleMinutes: number; shift: string | null; subject: string; teacher: { id: number; name: string } }

/** Aula → Horario: el horario del curso por módulos, con recreos y las ausencias de la semana. */
export const ClassroomTimetable = ({ divisionId, teachers }: { divisionId: number; teachers: Array<{ id: number; name: string }> }) => {
  const { session } = useSchool();
  const { user } = useAuth();
  const manages = useManagesAbsences();
  const [week, setWeek] = useState<0 | 1>(0);
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['classroom-timetable', divisionId], queryFn: () => apiGet<{ timetable: Timetable | null; slots: TimetableSlot[] }>(`/school/classrooms/${divisionId}/timetable`) });
  const monday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + week * 7);
    return d;
  }, [week]);
  const dateOf = (day: number) => iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day - 1));
  const absences = useAbsences({ from: dateOf(1), to: dateOf(6), divisionId });
  const upcoming = useAbsences({ divisionId });

  const days = useMemo(() => {
    const tt = q.data?.timetable;
    return [1, 2, 3, 4, 5, 6].map((day) => {
      const items = (q.data?.slots ?? [])
        .filter((s) => s.day === day)
        .flatMap((s) => {
          const pieces = s.modules ? expandModules(s.from, s.modules, s.moduleMinutes, tt?.breaks, s.shift).pieces.filter((p) => p.kind === 'module') : [{ kind: 'module' as const, from: s.from, to: s.to }];
          return pieces.map((p) => ({ ...s, from: p.from, to: p.to, isModule: !!s.modules }));
        })
        .sort((a, b) => toMin(a.from) - toMin(b.from));
      const first = items[0]?.from;
      const last = items[items.length - 1]?.to;
      const breaks = first && last ? breaksBetween(first, last, tt?.breaks) : [];
      return { day, items, breaks };
    }).filter((d) => d.day <= 5 || d.items.length);
  }, [q.data]);

  if (q.isLoading) return <Skeleton count={3} h={80} />;
  const canRegister = session?.isStaff && (manages || teachers.some((t) => t.id === user?.userData.id));
  return (
    <div className="stack">
      {!!upcoming.data?.length && (
        <div className="stack" style={{ gap: 6 }}>
          <b className="small row" style={{ gap: 6 }}><CalendarX2 size={16} /> Ausencias de docentes</b>
          {upcoming.data.slice(0, 6).map((a) => <AbsenceItem key={a.id} a={a} showDivisions={false} />)}
        </div>
      )}
      <div className="row-between wrap" style={{ gap: 8 }}>
        <Chips value={week} onChange={setWeek} items={[{ value: 0, label: 'Esta semana' }, { value: 1, label: 'Próxima semana' }]} />
        {canRegister && <button className="btn btn-sm" onClick={() => setAdding(true)}><UserX size={14} /> Registrar ausencia</button>}
      </div>
      {!q.data?.slots.length ? (
        <p className="small muted">Todavía no hay horario cargado para este curso. Lo arma la administración al cargar las horas de cada docente.</p>
      ) : (
        <div className="schedule" style={{ ['--days' as string]: days.length }}>
          {days.map(({ day, items, breaks }) => {
            const date = dateOf(day);
            const rows = [...items.map((i) => ({ t: toMin(i.from), i })), ...breaks.map((b) => ({ t: toMin(b.from), b }))].sort((a, b) => a.t - b.t);
            const starts = [...new Set(items.filter((i) => i.isModule).map((i) => i.from))];
            return (
              <div key={day} className="schedule-col">
                <div className="xs muted" style={{ fontWeight: 800 }}>{DAYS[day]} {Number(date.slice(8))}{date === todayIso() ? ' · hoy' : ''}</div>
                {!rows.length && <div className="xs muted">—</div>}
                {rows.map((r, k) => {
                  if ('b' in r && r.b) return <div key={k} className="schedule-slot xs" style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--muted)' }}><Coffee size={11} /> {r.b.label} {r.b.from}–{r.b.to}</div>;
                  const i = (r as { i: (typeof items)[number] }).i;
                  const absent = absences.data?.find((a) => a.teacher?.id === i.teacher.id && covers(a, date) && overlapsTime(a, i.from, i.to));
                  return (
                    <div key={k} className="schedule-slot" style={absent ? { background: 'rgba(246,149,10,.15)', borderColor: 'var(--brand-orange, #F6950A)' } : undefined} title={absent ? `Falta ${i.teacher.name}` : undefined}>
                      <span className="xs muted">{i.isModule ? `Módulo ${starts.indexOf(i.from) + 1} · ` : ''}</span>{i.from}–{i.to}
                      <div className="truncate" style={{ fontWeight: 600, textDecoration: absent ? 'line-through' : undefined }}>{i.subject}</div>
                      <div className="xs muted truncate">{i.teacher.name}</div>
                      {absent && <div className="xs" style={{ fontWeight: 700, color: 'var(--brand-orange, #F6950A)' }}>Falta{absent.substitute ? ` · ${absent.substitute}` : ''}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {adding && <AbsenceSheet open onClose={() => setAdding(false)} teachers={teachers} />}
    </div>
  );
};
