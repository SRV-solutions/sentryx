import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Flag, Star, Users } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Badge, Card, Empty, ErrorBox, PageHeader, Sheet, Skeleton, useToast } from '../../ui';
import { Entity, Action } from '../../school/permissions';
import { PlanGate } from '../../school/PlanGate';
import { PlanFeature } from '../../school/plans';
import { EventFormSheet } from '../../school/EventForm';
import { SchoolEvent, dateOf } from '../../school/events';

interface HolidayRow {
  key: string;
  name: string;
  date: string;
  kind: 'FERIADO' | 'NO_LABORABLE' | 'EFEMERIDE';
  originalDate: string | null;
  act: { title: string; date: string } | null;
  holidayImported: boolean;
  actImported: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthTitle = (key: string) => {
  const s = dateOf(`${key}-15`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s[0].toUpperCase() + s.slice(1);
};
const lastDay = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad(new Date(y, m, 0).getDate())}`;
};
const shortDate = (iso: string) => dateOf(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Importar feriados nacionales y actos sugeridos del año (sin duplicar). */
const HolidaysSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const list = useQuery({ queryKey: ['holidays', year], queryFn: () => apiGet<HolidayRow[]>(`/school/events/holidays?year=${year}`), enabled: open });
  const [choice, setChoice] = useState<Record<string, { holiday: boolean; act: boolean; actDate?: string }>>({});
  const rows = list.data ?? [];
  const value = (h: HolidayRow) => choice[h.key] ?? { holiday: h.kind !== 'EFEMERIDE' && !h.holidayImported, act: !!h.act && !h.actImported };
  const items = rows.map((h) => ({ key: h.key, ...value(h) })).filter((i) => i.holiday || i.act);
  const save = useMutation({
    mutationFn: () => apiSend<{ holidays: number; acts: number }>('POST', '/school/events/holidays', { year, items }),
    onSuccess: (r) => (toast(`Se agregaron ${r.holidays} feriados y ${r.acts} actos`), qc.invalidateQueries({ queryKey: ['events'] }), qc.invalidateQueries({ queryKey: ['holidays'] }), onClose()),
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <Sheet open={open} onClose={onClose} title="Feriados nacionales y actos">
      <div className="stack">
        <div className="chips">
          {[new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => <button key={y} type="button" className={`chip ${year === y ? 'active' : ''}`} onClick={() => (setYear(y), setChoice({}))}>{y}</button>)}
        </div>
        <p className="xs muted">Los feriados trasladables ya vienen movidos según la ley. El acto se sugiere el día hábil anterior a la efeméride; podés cambiar la fecha. Revisá si el Gobierno agregó días no laborables por decreto.</p>
        {list.isLoading && <Skeleton count={5} h={50} />}
        <div className="card list" style={{ overflow: 'hidden' }}>
          {rows.map((h) => {
            const v = value(h);
            const set = (patch: Partial<typeof v>) => setChoice({ ...choice, [h.key]: { ...v, ...patch } });
            return (
              <div key={h.key} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div className="row-between" style={{ gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 700 }}>{h.name}</div>
                    <div className="xs muted">{shortDate(h.date)}{h.originalDate ? ` (trasladado del ${shortDate(h.originalDate)})` : ''}</div>
                  </div>
                  {h.kind !== 'EFEMERIDE' && (
                    <label className="row xs" style={{ gap: 4, flexShrink: 0 }}>
                      <input type="checkbox" disabled={h.holidayImported} checked={h.holidayImported || v.holiday} onChange={(e) => set({ holiday: e.target.checked })} />
                      {h.holidayImported ? 'Ya está' : h.kind === 'FERIADO' ? 'Feriado' : 'No laborable'}
                    </label>
                  )}
                </div>
                {h.act && (
                  <div className="row wrap xs" style={{ gap: 6 }}>
                    <label className="row" style={{ gap: 4 }}>
                      <input type="checkbox" disabled={h.actImported} checked={h.actImported || v.act} onChange={(e) => set({ act: e.target.checked })} />
                      <Star size={12} className="accent" /> {h.actImported ? 'Acto ya agendado' : h.act.title}
                    </label>
                    {!h.actImported && v.act && <input type="date" className="input" style={{ width: 150, minHeight: 34 }} value={v.actDate ?? h.act.date} onChange={(e) => set({ actDate: e.target.value })} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className="btn btn-accent btn-block" disabled={!items.length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Agregando…' : `Agregar al calendario (${items.length})`}</button>
      </div>
    </Sheet>
  );
};

const EventChip = ({ e }: { e: SchoolEvent }) => (
  <Link to={`/calendario/${e.id}`} className={`cal-event cal-kind-${e.kind}`} style={{ opacity: e.cancelled ? 0.5 : 1 }}>
    <div className="grow" style={{ minWidth: 0 }}>
      <div className="small" style={{ fontWeight: 700, textDecoration: e.cancelled ? 'line-through' : undefined }}>{e.title}</div>
      <div className="xs muted">
        {e.kindLabel}
        {e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}
        {e.location ? ` · ${e.location}` : ''}
        {e.audience === 'STAFF' ? ' · Solo personal' : ''}
      </div>
    </div>
    {e.isManager && <Badge tone="accent">Encargado/a</Badge>}
    {!!e.Managers?.length && !e.isManager && <span className="xs muted row" style={{ gap: 2 }}><Users size={12} />{e.Managers.length}</span>}
  </Link>
);

/** Calendario institucional (plan Integral): actos, feriados, reuniones y salidas. */
export default function CalendarPage() {
  const { can, session } = useSchool();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [creating, setCreating] = useState(false);
  const [holidays, setHolidays] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const events = useQuery({
    queryKey: ['events', month],
    queryFn: () => apiGet<SchoolEvent[]>(`/school/events?from=${month}-01&to=${lastDay(month)}`),
    placeholderData: keepPreviousData,
  });
  const mine = useQuery({ queryKey: ['events', 'mine'], queryFn: () => apiGet<SchoolEvent[]>('/school/events/mine'), enabled: !!session?.isStaff });
  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(monthKey(new Date(y, m - 1 + delta, 1)));
  };
  const byDay = useMemo(() => {
    const map = new Map<string, SchoolEvent[]>();
    for (const e of events.data ?? []) {
      if (onlyMine && !e.isManager) continue;
      map.set(e.date, [...(map.get(e.date) ?? []), e]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events.data, onlyMine]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="stack-lg">
      <PageHeader
        title="Calendario"
        subtitle="Actos, feriados, reuniones y salidas."
        actions={
          can(Entity.EVENTS, Action.CREATE) && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-ghost" onClick={() => setHolidays(true)}><Flag size={16} /> <span className="hide-mobile">Feriados</span></button>
              <button className="btn" onClick={() => setCreating(true)}><Plus size={18} /> Nuevo</button>
            </div>
          )
        }
      />
      <PlanGate feature={PlanFeature.EVENTS} title="Calendario de actos y eventos">
        {!!mine.data?.length && (
          <Card>
            <div className="stack" style={{ gap: 8 }}>
              <h2 className="h3 row"><Star size={16} className="accent" /> Mis actos</h2>
              {mine.data.slice(0, 5).map((e) => (
                <Link key={e.id} to={`/calendario/${e.id}`} className="row-between small" style={{ color: 'inherit' }}>
                  <span className="truncate">{e.title}</span>
                  <span className="muted">{shortDate(e.date)}</span>
                </Link>
              ))}
            </div>
          </Card>
        )}
        <div className="row-between">
          <button className="icon-btn" aria-label="Mes anterior" onClick={() => shift(-1)}><ChevronLeft size={20} /></button>
          <div className="h2">{monthTitle(month)}</div>
          <button className="icon-btn" aria-label="Mes siguiente" onClick={() => shift(1)}><ChevronRight size={20} /></button>
        </div>
        {session?.isStaff && (
          <div className="chips">
            <button className={`chip ${!onlyMine ? 'active' : ''}`} onClick={() => setOnlyMine(false)}>Todo</button>
            <button className={`chip ${onlyMine ? 'active' : ''}`} onClick={() => setOnlyMine(true)}>Donde soy encargado/a</button>
            {month !== monthKey(new Date()) && <button className="chip" onClick={() => setMonth(monthKey(new Date()))}>Hoy</button>}
          </div>
        )}
        {events.error && <ErrorBox error={events.error} />}
        {events.isLoading && <Skeleton count={4} h={70} />}
        {events.data && !byDay.length && <Empty title="No hay eventos este mes" text={can(Entity.EVENTS, Action.CREATE) ? 'Agregá un acto o importá los feriados nacionales del año.' : undefined} />}
        {!!byDay.length && (
          <div className="card" style={{ overflow: 'hidden' }}>
            {byDay.map(([date, list]) => {
              const d = dateOf(date);
              return (
                <div key={date} className="cal-day" style={{ background: date === today ? 'var(--info-bg)' : undefined }}>
                  <div className="cal-date">
                    <div className="dow">{d.toLocaleDateString('es-AR', { weekday: 'short' })}</div>
                    <div className="num">{d.getDate()}</div>
                  </div>
                  <div className="stack grow" style={{ gap: 6, minWidth: 0 }}>{list.map((e) => <EventChip key={e.id} e={e} />)}</div>
                </div>
              );
            })}
          </div>
        )}
      </PlanGate>
      <EventFormSheet open={creating} onClose={() => setCreating(false)} />
      <HolidaysSheet open={holidays} onClose={() => setHolidays(false)} />
    </div>
  );
}
