/**
 * Horario de una persona módulo por módulo, con los recreos en su lugar.
 * Se puede ver por semana, por materia, por curso o por cargo (Mi legajo, ficha, Personal).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coffee } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Chips } from '../ui';
import { DAYS, type StaffPosition } from './staffRecords';
import { buildSchedule, toMin, type ScheduleItem } from './timetable';
import type { Structure } from './types';

type Mode = 'week' | 'subject' | 'course' | 'cargo';
const SHORT_DAYS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const minutesOf = (items: ScheduleItem[]) => items.reduce((sum, i) => sum + toMin(i.to) - toMin(i.from), 0);
const hoursLabel = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;

/** "12 módulos · 8 h" (o solo horas, si son bloques de un cargo). */
const amount = (items: ScheduleItem[]) => {
  const modules = items.filter((i) => i.kind === 'module').length;
  const min = minutesOf(items);
  return modules ? `${modules} ${modules === 1 ? 'módulo' : 'módulos'} · ${hoursLabel(min)}` : hoursLabel(min);
};

/** Rangos corridos de cada día (dos módulos seguidos, o separados solo por un recreo, son un mismo rango). */
const runsByDay = (items: ScheduleItem[]) => {
  const out = new Map<number, Array<{ from: string; to: string; modules: number; minutes: number; gap: boolean }>>();
  for (const i of [...items].sort((x, y) => x.day - y.day || toMin(x.from) - toMin(y.from))) {
    const runs = out.get(i.day) ?? [];
    const last = runs[runs.length - 1];
    const dur = toMin(i.to) - toMin(i.from);
    if (last && toMin(i.from) <= toMin(last.to) + 30) {
      if (toMin(i.from) > toMin(last.to)) last.gap = true;
      if (toMin(i.to) > toMin(last.to)) last.to = i.to;
      last.modules += i.kind === 'module' ? 1 : 0;
      last.minutes += dur;
    } else runs.push({ from: i.from, to: i.to, modules: i.kind === 'module' ? 1 : 0, minutes: dur, gap: false });
    out.set(i.day, runs);
  }
  return [...out.entries()];
};

const Group = ({ title, subtitle, items, detail }: { title: string; subtitle?: string; items: ScheduleItem[]; detail?: (i: ScheduleItem) => string | null }) => {
  const parts = detail
    ? [...items.reduce((m, i) => {
        const k = detail(i);
        if (k) m.set(k, [...(m.get(k) ?? []), i]);
        return m;
      }, new Map<string, ScheduleItem[]>())]
    : [];
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row-between wrap" style={{ gap: 6, marginBottom: 8 }}>
        <span><b>{title}</b>{subtitle && <span className="xs muted"> · {subtitle}</span>}</span>
        <span className="badge badge-info">{amount(items)}</span>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        {runsByDay(items).map(([day, runs]) => (
          <div key={day} className="row wrap small" style={{ gap: 6 }}>
            <span style={{ width: 38, fontWeight: 800 }}>{SHORT_DAYS[day]}</span>
            {runs.map((r, k) => (
              <span key={k} className="badge" title={r.gap ? 'Incluye recreo' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {r.from}–{r.to}
                <span className="muted" style={{ fontWeight: 500 }}> · {r.modules ? `${r.modules} mód.` : hoursLabel(r.minutes)}{r.gap ? ' ☕' : ''}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      {parts.length > 1 && (
        <div className="row wrap" style={{ gap: 4, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {parts.map(([k, list]) => <span key={k} className="chip" style={{ cursor: 'default' }}>{k} · {amount(list)}</span>)}
        </div>
      )}
    </div>
  );
};

export const ScheduleView = ({ positions }: { positions: StaffPosition[] }) => {
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const [mode, setMode] = useState<Mode>('week');
  const { items, breaks } = useMemo(() => buildSchedule(positions, structure.data), [positions, structure.data]);
  if (!items.length) return <p className="small muted">Todavía no hay horario cargado.</p>;
  const hasSubjects = items.some((i) => i.subject);
  const group = (key: (i: ScheduleItem) => string) => {
    const m = new Map<string, ScheduleItem[]>();
    for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  };
  const days = [1, 2, 3, 4, 5, 6].filter((d) => d <= 5 || items.some((i) => i.day === d));

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row-between wrap" style={{ gap: 8 }}>
        <Chips
          value={mode}
          onChange={setMode}
          items={[
            { value: 'week', label: 'Semana' },
            ...(hasSubjects ? [{ value: 'subject' as const, label: 'Por materia' }, { value: 'course' as const, label: 'Por curso' }] : []),
            { value: 'cargo', label: 'Por cargo' },
          ]}
        />
        <span className="xs muted">Total: {amount(items)} por semana</span>
      </div>

      {mode === 'week' && (
        <div className="schedule" style={{ ['--days' as string]: days.length }}>
          {days.map((day) => {
            const dayItems = items.filter((i) => i.day === day);
            const first = dayItems[0] ? toMin(dayItems[0].from) : 0;
            const last = dayItems.length ? toMin(dayItems[dayItems.length - 1].to) : 0;
            // Recreos de ese día dentro de su jornada.
            const dayBreaks = breaks.filter((b) => b.day === day && toMin(b.from) >= first && toMin(b.to) <= last);
            const rows: Array<{ t: number; item?: ScheduleItem; brk?: (typeof dayBreaks)[number] }> = [...dayItems.map((i) => ({ t: toMin(i.from), item: i })), ...dayBreaks.map((b) => ({ t: toMin(b.from), brk: b }))].sort((a, b) => a.t - b.t);
            // Número de módulo por horario: dos franjas a la misma hora son el mismo módulo.
            const starts = [...new Set(dayItems.filter((i) => i.kind === 'module').map((i) => i.from))].sort((a, b) => toMin(a) - toMin(b));
            return (
              <div key={day} className="schedule-col">
                <div className="xs muted" style={{ fontWeight: 800 }}>{DAYS[day]}</div>
                {!rows.length && <div className="xs muted">—</div>}
                {rows.map((r, k) =>
                  r.brk ? (
                    <div key={k} className="schedule-slot xs" style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--muted)' }}>
                      <Coffee size={11} /> {r.brk.label} {r.brk.from}–{r.brk.to}
                    </div>
                  ) : r.item ? (
                    <div key={k} className="schedule-slot" title={[r.item.subject, r.item.course, r.item.cargo].filter(Boolean).join(' · ')}>
                      <span className="xs muted">{r.item.kind === 'module' ? `Módulo ${starts.indexOf(r.item.from) + 1} · ` : ''}</span>{r.item.from}–{r.item.to}
                      <div className="truncate" style={{ fontWeight: 600 }}>{r.item.subject ?? r.item.cargo}</div>
                      {r.item.course && <div className="xs muted truncate">{r.item.course}</div>}
                    </div>
                  ) : null
                )}
              </div>
            );
          })}
        </div>
      )}
      {mode === 'subject' && (
        <div className="stack" style={{ gap: 8 }}>
          {group((i) => i.subject ?? i.cargo).map(([name, list]) => <Group key={name} title={name} subtitle={[...new Set(list.map((i) => i.course).filter(Boolean))].join(', ')} items={list} detail={(i) => i.course} />)}
        </div>
      )}
      {mode === 'course' && (
        <div className="stack" style={{ gap: 8 }}>
          {group((i) => i.course ?? `Sin curso · ${i.cargo}`).map(([name, list]) => <Group key={name} title={name} subtitle={[...new Set(list.map((i) => i.subject).filter(Boolean))].join(', ')} items={list} detail={(i) => i.subject} />)}
        </div>
      )}
      {mode === 'cargo' && (
        <div className="stack" style={{ gap: 8 }}>
          {group((i) => i.cargo).map(([name, list]) => <Group key={name} title={name} subtitle={list[0].level ?? undefined} items={list} detail={(i) => (i.subject ? [i.subject, i.course].filter(Boolean).join(' · ') : null)} />)}
        </div>
      )}
      {breaks.length > 0 && mode === 'week' && <span className="xs muted"><Coffee size={11} /> Los recreos los configura la conducción en Administración → Horarios.</span>}
    </div>
  );
};
