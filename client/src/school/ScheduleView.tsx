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

const Group = ({ title, subtitle, items }: { title: string; subtitle?: string; items: ScheduleItem[] }) => (
  <div className="card" style={{ padding: 12 }}>
    <div className="row-between wrap" style={{ gap: 6, marginBottom: 6 }}>
      <span><b>{title}</b>{subtitle && <span className="xs muted"> · {subtitle}</span>}</span>
      <span className="badge badge-info">{amount(items)}</span>
    </div>
    <div className="stack" style={{ gap: 2 }}>
      {items.map((i, k) => (
        <div key={k} className="row xs" style={{ gap: 8 }}>
          <span style={{ width: 34, fontWeight: 700 }}>{SHORT_DAYS[i.day]}</span>
          <span style={{ width: 92, fontVariantNumeric: 'tabular-nums' }}>{i.from}–{i.to}</span>
          <span className="muted truncate">{[i.subject, i.course].filter(Boolean).join(' · ') || i.cargo}</span>
        </div>
      ))}
    </div>
  </div>
);

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
          {group((i) => i.subject ?? i.cargo).map(([name, list]) => <Group key={name} title={name} subtitle={[...new Set(list.map((i) => i.course).filter(Boolean))].join(', ')} items={list} />)}
        </div>
      )}
      {mode === 'course' && (
        <div className="stack" style={{ gap: 8 }}>
          {group((i) => i.course ?? `Sin curso · ${i.cargo}`).map(([name, list]) => <Group key={name} title={name} subtitle={[...new Set(list.map((i) => i.subject).filter(Boolean))].join(', ')} items={list} />)}
        </div>
      )}
      {mode === 'cargo' && (
        <div className="stack" style={{ gap: 8 }}>
          {group((i) => i.cargo).map(([name, list]) => <Group key={name} title={name} subtitle={list[0].level ?? undefined} items={list} />)}
        </div>
      )}
      {breaks.length > 0 && mode === 'week' && <span className="xs muted"><Coffee size={11} /> Los recreos los configura la conducción en Administración → Horarios.</span>}
    </div>
  );
};
