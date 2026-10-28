/**
 * Calendario del aula: evaluaciones, TP y tareas del curso, actos y eventos del colegio y feriados.
 * Grilla mensual en pantallas anchas; en el celular, agenda agrupada por día (la grilla no entra).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, BookOpen, ExternalLink } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Badge, Empty, ErrorBox, Sheet, Skeleton } from '../ui';
import './classroomCalendar.css';

export interface ClassroomCalendarItem {
  id: string;
  source: 'POST' | 'EVENT' | 'HOLIDAY';
  kind: string;
  kindLabel: string;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  subject: { id: number; name: string } | null;
  description: string | null;
  location?: string | null;
  link: string | null;
  cancelled: boolean;
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOf = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const fmt = (s: string, opts: Intl.DateTimeFormatOptions) => dateOf(s).toLocaleDateString('es-AR', opts);
const endOf = (i: ClassroomCalendarItem) => i.endDate ?? i.date;
const covers = (i: ClassroomCalendarItem, day: string) => i.date <= day && endOf(i) >= day;
const isOff = (i: ClassroomCalendarItem) => (i.kind === 'FERIADO' || i.kind === 'NO_LABORABLE') && !i.cancelled;

/** Tono por tipo: evaluación = peligro, TP = aviso, tarea = info, feriado = apagado, actos y eventos = acento. */
const toneOf = (kind: string) =>
  kind === 'EVALUACION' ? 'eval' : kind === 'TP' ? 'tp' : kind === 'TAREA' ? 'tarea' : kind === 'FERIADO' || kind === 'NO_LABORABLE' ? 'off' : 'event';
const BADGE_TONE: Record<string, 'danger' | 'warn' | 'info' | 'accent' | undefined> = { eval: 'danger', tp: 'warn', tarea: 'info', off: undefined, event: 'accent' };
const LEGEND = [
  { tone: 'eval', label: 'Evaluación' },
  { tone: 'tp', label: 'Trabajo práctico' },
  { tone: 'tarea', label: 'Tarea' },
  { tone: 'event', label: 'Acto o evento' },
  { tone: 'off', label: 'Feriado / no laborable' },
];

const whenText = (i: ClassroomCalendarItem) => {
  const long: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  const range = i.endDate ? `Del ${fmt(i.date, { day: 'numeric', month: 'long' })} al ${fmt(i.endDate, long)}` : fmt(i.date, long);
  return range.charAt(0).toUpperCase() + range.slice(1);
};
const timeText = (i: ClassroomCalendarItem) => (i.startTime ? `${i.startTime}${i.endTime ? ` a ${i.endTime}` : ''} h` : null);

/** < 640px: agenda en lugar de grilla. */
const useNarrow = () => {
  const query = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
};

const ItemSheet = ({ item, onClose }: { item: ClassroomCalendarItem; onClose: () => void }) => (
  <Sheet open onClose={onClose} title={item.title}>
    <div className="stack">
      <div className="row wrap" style={{ gap: 6 }}>
        <Badge tone={BADGE_TONE[toneOf(item.kind)]}>{item.kindLabel}</Badge>
        {item.cancelled && <Badge tone="danger">Suspendido</Badge>}
      </div>
      <div className="row small"><CalendarDays size={16} className="muted" /> {whenText(item)}</div>
      {timeText(item) && <div className="row small"><Clock size={16} className="muted" /> {timeText(item)}</div>}
      {item.subject && <div className="row small"><BookOpen size={16} className="muted" /> {item.subject.name}</div>}
      {item.location && <div className="row small"><MapPin size={16} className="muted" /> {item.location}</div>}
      {item.description && <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{item.description}</p>}
      {item.source === 'POST' && <p className="xs muted">Los detalles y archivos están en el muro del aula.</p>}
      {item.link && <Link to={item.link} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}><ExternalLink size={14} /> Ver en el calendario</Link>}
    </div>
  </Sheet>
);

const DaySheet = ({ day, items, onPick, onClose }: { day: string; items: ClassroomCalendarItem[]; onPick: (i: ClassroomCalendarItem) => void; onClose: () => void }) => {
  const title = fmt(day, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Sheet open onClose={onClose} title={title.charAt(0).toUpperCase() + title.slice(1)}>
      <div className="ccal-agenda-items">
        {items.map((i) => <AgendaButton key={i.id} item={i} onPick={onPick} />)}
      </div>
    </Sheet>
  );
};

const AgendaButton = ({ item, onPick }: { item: ClassroomCalendarItem; onPick: (i: ClassroomCalendarItem) => void }) => (
  <button type="button" className={`ccal-agenda-item ccal-t-${toneOf(item.kind)}${item.cancelled ? ' is-cancelled' : ''}`} onClick={() => onPick(item)}>
    <span className="ccal-agenda-title">{item.title}</span>
    <span className="ccal-agenda-meta">
      {item.kindLabel}
      {item.subject ? ` · ${item.subject.name}` : ''}
      {timeText(item) ? ` · ${timeText(item)}` : ''}
      {item.endDate ? ` · hasta el ${fmt(item.endDate, { day: 'numeric', month: 'short' })}` : ''}
      {item.cancelled ? ' · Suspendido' : ''}
    </span>
  </button>
);

export const ClassroomCalendar = ({ divisionId }: { divisionId: number }) => {
  const narrow = useNarrow();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1, 12); });
  const [open, setOpen] = useState<ClassroomCalendarItem | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const today = iso(new Date());

  // Se pide la grilla completa (de lunes a domingo, con los días de los meses vecinos): máximo 42 días.
  const { days, from, to, monthFrom, monthTo } = useMemo(() => {
    const first = month;
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const weeks = Math.ceil(((first.getDay() + 6) % 7 + last.getDate()) / 7);
    const list = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
    return { days: list, from: iso(list[0]), to: iso(list[list.length - 1]), monthFrom: iso(first), monthTo: iso(last) };
  }, [month]);

  const q = useQuery({
    queryKey: ['classroom-calendar', divisionId, from, to],
    queryFn: () => apiGet<{ from: string; to: string; items: ClassroomCalendarItem[] }>(`/school/classrooms/${divisionId}/calendar?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  });
  const items = q.data?.items ?? [];
  const inMonth = items.filter((i) => i.date <= monthTo && endOf(i) >= monthFrom);

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1, 12));
  const isCurrentMonth = monthFrom.slice(0, 7) === today.slice(0, 7);
  const title = month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  // Agenda: cada ítem una sola vez, en su primer día dentro del mes (los de varios días muestran "hasta el …").
  const agenda = useMemo(() => {
    const byDay = new Map<string, ClassroomCalendarItem[]>();
    for (const i of inMonth) {
      const key = i.date < monthFrom ? monthFrom : i.date;
      byDay.set(key, [...(byDay.get(key) ?? []), i]);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [inMonth, monthFrom]);

  return (
    <section className="stack">
      <div className="ccal-head">
        <div className="ccal-title">{title}</div>
        {!isCurrentMonth && <button className="btn btn-ghost btn-sm" onClick={() => setMonth(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1, 12); })}>Hoy</button>}
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
      </div>
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton count={1} h={narrow ? 240 : 480} />}

      {q.data && narrow && (
        agenda.length ? (
          <div className="card ccal-agenda" style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
            {agenda.map(([day, list]) => (
              <div key={day} className={`ccal-agenda-day${day === today ? ' is-today' : ''}`}>
                <div className="ccal-agenda-date">
                  <div className="num">{dateOf(day).getDate()}</div>
                  <div className="dow">{fmt(day, { weekday: 'short' }).replace('.', '')}</div>
                </div>
                <div className="ccal-agenda-items">{list.map((i) => <AgendaButton key={i.id} item={i} onPick={setOpen} />)}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nada agendado este mes" text="Las evaluaciones, los TP, las tareas con fecha, los actos y los feriados van a aparecer acá." icon={<CalendarDays size={36} strokeWidth={1.5} />} />
        )
      )}

      {q.data && !narrow && (
        <>
          <div className="ccal-grid" style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
            {WEEKDAYS.map((d, i) => <div key={i} className="ccal-dow">{d}</div>)}
            {days.map((d, idx) => {
              const day = iso(d);
              const list = items.filter((i) => covers(i, day));
              const shown = list.slice(0, 3);
              const cls = [
                'ccal-cell',
                day < monthFrom || day > monthTo ? 'is-out' : '',
                d.getDay() === 0 || d.getDay() === 6 ? 'is-weekend' : '',
                list.some(isOff) ? 'is-off' : '',
                day === today ? 'is-today' : '',
              ].filter(Boolean).join(' ');
              const col = idx % 7;
              return (
                <div key={day} className={cls}>
                  <button type="button" className="ccal-num" onClick={() => list.length && setOpenDay(day)} aria-label={fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}>{d.getDate()}</button>
                  {shown.map((i) => {
                    // Varios días: se pega con el día vecino dentro de la misma semana.
                    const left = i.date < day && col > 0;
                    const right = endOf(i) > day && col < 6;
                    const first = !left;
                    return (
                      <button
                        key={i.id}
                        type="button"
                        className={`ccal-chip ccal-t-${toneOf(i.kind)}${left ? ' cont-left' : ''}${right ? ' cont-right' : ''}${i.cancelled ? ' is-cancelled' : ''}`}
                        title={`${i.kindLabel}: ${i.title}${i.subject ? ` · ${i.subject.name}` : ''}`}
                        onClick={() => setOpen(i)}
                      >
                        {first ? `${i.startTime && !i.endDate ? `${i.startTime} ` : ''}${i.title}` : ' '}
                      </button>
                    );
                  })}
                  {list.length > shown.length && <button type="button" className="ccal-more" onClick={() => setOpenDay(day)}>+{list.length - shown.length} más</button>}
                </div>
              );
            })}
          </div>
          {!inMonth.length && <p className="small muted">No hay evaluaciones, tareas, actos ni feriados este mes.</p>}
        </>
      )}

      <div className="ccal-legend">
        {LEGEND.map((l) => <span key={l.tone}><i className={`ccal-dot ccal-t-${l.tone}`} />{l.label}</span>)}
      </div>

      {openDay && <DaySheet day={openDay} items={items.filter((i) => covers(i, openDay))} onPick={(i) => { setOpenDay(null); setOpen(i); }} onClose={() => setOpenDay(null)} />}
      {open && <ItemSheet item={open} onClose={() => setOpen(null)} />}
    </section>
  );
};
