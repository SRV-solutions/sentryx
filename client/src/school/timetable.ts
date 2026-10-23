/**
 * Horario institucional por nivel (Administración → Horarios): entrada, duración del módulo y recreos.
 * Con eso, una franja de "4 módulos desde 07:30" se arma sola salteando los recreos, y los horarios
 * del personal se muestran módulo por módulo con los recreos en su lugar.
 */
import type { Level, Structure } from './types';
import type { ScheduleSlot, StaffPosition } from './staffRecords';

export interface SchoolBreak {
  from: string;
  minutes: number;
  /** Turno al que aplica (vacío = todos). */
  shift?: string | null;
  label?: string;
}
export interface Timetable {
  /** Entrada del turno (para sugerir la primera franja). */
  start?: string;
  moduleMinutes: number;
  breaks: SchoolBreak[];
}
export const DEFAULT_TIMETABLE: Timetable = { start: '07:30', moduleMinutes: 40, breaks: [] };

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const toTime = (min: number) => {
  const v = Math.max(0, Math.min(min, 23 * 60 + 59));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

export const timetableOf = (level?: Pick<Level, 'settings'> | null): Timetable | null => (level?.settings as { timetable?: Timetable } | undefined)?.timetable ?? null;

const breaksFor = (breaks: SchoolBreak[], shift?: string | null) =>
  breaks.filter((b) => !b.shift || !shift || b.shift === shift).map((b) => ({ ...b, s: toMin(b.from), e: toMin(b.from) + b.minutes })).sort((a, b) => a.s - b.s);

export interface Piece { kind: 'module' | 'break'; from: string; to: string; label?: string }

/** Módulos de una franja desde "from", salteando los recreos que caen en el medio. */
export const expandModules = (from: string, modules: number, moduleMinutes: number, breaks: SchoolBreak[] = [], shift?: string | null) => {
  const list = breaksFor(breaks, shift);
  const pieces: Piece[] = [];
  let cursor = toMin(from);
  for (let k = 0; k < modules; k++) {
    // Si el módulo pisaría un recreo, arranca después del recreo.
    for (let moved = true; moved; ) {
      moved = false;
      for (const b of list) {
        if (b.s < cursor + moduleMinutes && b.e > cursor) {
          if (k > 0 || b.s > cursor) pieces.push({ kind: 'break', from: toTime(Math.max(b.s, cursor)), to: toTime(b.e), label: b.label || 'Recreo' });
          cursor = b.e;
          moved = true;
        }
      }
    }
    pieces.push({ kind: 'module', from: toTime(cursor), to: toTime(cursor + moduleMinutes) });
    cursor += moduleMinutes;
  }
  // Un recreo que quedó antes del primer módulo no es parte de la franja.
  while (pieces[0]?.kind === 'break') pieces.shift();
  return { pieces, start: pieces[0]?.from ?? from, end: toTime(cursor) };
};

/** Recreos dentro de un rango de horas (cargos por horas reloj: Rectoría, Preceptoría…). */
export const breaksBetween = (from: string, to: string, breaks: SchoolBreak[] = [], shift?: string | null): Piece[] =>
  breaksFor(breaks, shift)
    .filter((b) => b.s >= toMin(from) && b.e <= toMin(to))
    .map((b) => ({ kind: 'break', from: toTime(b.s), to: toTime(b.e), label: b.label || 'Recreo' }));

export const usesModules = (kind: StaffPosition['kind']) => kind !== 'CARGO';
export const modulesOf = (s: ScheduleSlot, moduleMinutes: number) => s.modules ?? Math.max(1, Math.round((toMin(s.to) - toMin(s.from)) / (moduleMinutes || 40)));

/** Un módulo (o bloque horario) del horario de una persona, con todo lo necesario para agruparlo. */
export interface ScheduleItem {
  day: number;
  from: string;
  to: string;
  kind: 'module' | 'block';
  subject: string | null;
  course: string | null;
  cargo: string;
  level: string | null;
}

/** Arma los módulos y los recreos de los cargos de una persona. */
export const buildSchedule = (positions: StaffPosition[], structure?: Pick<Structure, 'levels' | 'divisions' | 'subjects'> | null) => {
  const items: ScheduleItem[] = [];
  const breaks = new Map<string, Piece & { day: number }>();
  for (const p of positions.filter((x) => x.active !== false)) {
    for (const s of p.schedule) {
      const division = s.divisionId ? structure?.divisions.find((d) => d.id === s.divisionId) : undefined;
      const level = structure?.levels.find((l) => l.id === (division?.levelId ?? p.levelId));
      const tt = timetableOf(level);
      const [labelSubject, labelCourse] = (s.label ?? '').split(' · ');
      const subject = s.subjectId ? structure?.subjects.find((x) => x.id === s.subjectId)?.name ?? labelSubject ?? null : null;
      const course = division?.name ?? (s.subjectId ? labelCourse ?? null : null);
      const base = { day: s.day, subject, course, cargo: p.title, level: level?.name ?? p.Level?.name ?? null };
      let pieces: Piece[];
      // Franjas cargadas por módulos: se arman salteando recreos. Las anteriores (desde–hasta) se respetan tal cual.
      if (usesModules(p.kind) && s.modules) {
        const mm = p.moduleMinutes ?? tt?.moduleMinutes ?? 40;
        pieces = expandModules(s.from, modulesOf(s, mm), mm, tt?.breaks, p.shift).pieces;
      } else {
        const inside = breaksBetween(s.from, s.to, tt?.breaks, p.shift);
        // Un bloque horario partido por sus recreos.
        pieces = [];
        let cursor = s.from;
        for (const b of inside) {
          if (toMin(b.from) > toMin(cursor)) pieces.push({ kind: 'module', from: cursor, to: b.from });
          pieces.push(b);
          cursor = b.to;
        }
        if (toMin(s.to) > toMin(cursor)) pieces.push({ kind: 'module', from: cursor, to: s.to });
      }
      for (const piece of pieces) {
        if (piece.kind === 'break') breaks.set(`${s.day}|${piece.from}`, { ...piece, day: s.day });
        else items.push({ ...base, from: piece.from, to: piece.to, kind: usesModules(p.kind) && s.modules ? 'module' : 'block' });
      }
    }
  }
  items.sort((a, b) => a.day - b.day || toMin(a.from) - toMin(b.from));
  return { items, breaks: [...breaks.values()].sort((a, b) => a.day - b.day || toMin(a.from) - toMin(b.from)) };
};
