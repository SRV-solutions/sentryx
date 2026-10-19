/**
 * Feriados nacionales de Argentina y actos escolares sugeridos para un año.
 *
 * - Inamovibles: siempre en su fecha.
 * - Trasladables (Ley 27.399): si caen martes o miércoles pasan al lunes anterior; jueves o viernes,
 *   al lunes siguiente.
 * - Carnaval y Semana Santa dependen de la Pascua.
 *
 * El Gobierno puede agregar días no laborables "con fines turísticos" o mover alguno por decreto:
 * por eso la escuela revisa la lista antes de importarla y puede editar cada fecha después.
 */

export interface HolidaySuggestion {
  /** Clave estable por año, ej: "2026-belgrano" (evita importar dos veces). */
  key: string;
  name: string;
  date: string;
  /** EFEMERIDE: no es feriado, solo se sugiere el acto (ej: Día del Maestro). */
  kind: 'FERIADO' | 'NO_LABORABLE' | 'EFEMERIDE';
  /** Si se trasladó, la fecha original. */
  originalDate: string | null;
  /** Acto escolar sugerido (el día hábil anterior, o el mismo día si no es feriado). */
  act: { title: string; date: string } | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
};

/** Ley 27.399, art. 6: martes/miércoles → lunes anterior; jueves/viernes → lunes siguiente. */
const moveTransferable = (date: Date) => {
  const weekday = date.getUTCDay(); // 0 domingo … 6 sábado
  if (weekday === 2) return addDays(date, -1);
  if (weekday === 3) return addDays(date, -2);
  if (weekday === 4) return addDays(date, 4);
  if (weekday === 5) return addDays(date, 3);
  return date;
};

interface Definition {
  id: string;
  name: string;
  month: number;
  day: number;
  transferable?: boolean;
  kind?: 'FERIADO' | 'NO_LABORABLE';
  act?: string;
}

const FIXED: Definition[] = [
  { id: 'anio-nuevo', name: 'Año Nuevo', month: 1, day: 1 },
  { id: 'memoria', name: 'Día Nacional de la Memoria por la Verdad y la Justicia', month: 3, day: 24, act: 'Acto: Día de la Memoria por la Verdad y la Justicia' },
  { id: 'malvinas', name: 'Día del Veterano y de los Caídos en la Guerra de Malvinas', month: 4, day: 2, act: 'Acto: Malvinas' },
  { id: 'trabajador', name: 'Día del Trabajador', month: 5, day: 1 },
  { id: 'mayo', name: 'Día de la Revolución de Mayo', month: 5, day: 25, act: 'Acto del 25 de Mayo' },
  { id: 'guemes', name: 'Paso a la Inmortalidad del Gral. Martín Miguel de Güemes', month: 6, day: 17, transferable: true },
  { id: 'belgrano', name: 'Paso a la Inmortalidad del Gral. Manuel Belgrano (Día de la Bandera)', month: 6, day: 20, act: 'Acto: Día de la Bandera' },
  { id: 'independencia', name: 'Día de la Independencia', month: 7, day: 9, act: 'Acto del 9 de Julio' },
  { id: 'sanmartin', name: 'Paso a la Inmortalidad del Gral. José de San Martín', month: 8, day: 17, transferable: true, act: 'Acto: General San Martín' },
  { id: 'diversidad', name: 'Día del Respeto a la Diversidad Cultural', month: 10, day: 12, transferable: true, act: 'Acto: Día del Respeto a la Diversidad Cultural' },
  { id: 'soberania', name: 'Día de la Soberanía Nacional', month: 11, day: 20, transferable: true, act: 'Acto: Día de la Soberanía Nacional' },
  { id: 'inmaculada', name: 'Inmaculada Concepción de María', month: 12, day: 8 },
  { id: 'navidad', name: 'Navidad', month: 12, day: 25 },
];

/** Efemérides escolares que no son feriado pero tienen acto. */
const SCHOOL_ONLY: Array<{ id: string; name: string; month: number; day: number; act: string }> = [
  { id: 'maestro', name: 'Día del Maestro (Domingo F. Sarmiento)', month: 9, day: 11, act: 'Acto: Día del Maestro' },
];

export const nationalHolidays = (year: number): HolidaySuggestion[] => {
  const easter = easterSunday(year);
  const list: Array<Omit<HolidaySuggestion, 'act'> & { actTitle?: string; anchor: Date }> = [];

  for (const def of FIXED) {
    const original = utc(year, def.month, def.day);
    const date = def.transferable ? moveTransferable(original) : original;
    list.push({
      key: `${year}-${def.id}`,
      name: def.name,
      date: iso(date),
      kind: def.kind ?? 'FERIADO',
      originalDate: iso(date) !== iso(original) ? iso(original) : null,
      actTitle: def.act,
      anchor: original,
    });
  }
  list.push(
    { key: `${year}-carnaval-lunes`, name: 'Carnaval', date: iso(addDays(easter, -48)), kind: 'FERIADO', originalDate: null, anchor: addDays(easter, -48) },
    { key: `${year}-carnaval-martes`, name: 'Carnaval', date: iso(addDays(easter, -47)), kind: 'FERIADO', originalDate: null, anchor: addDays(easter, -47) },
    { key: `${year}-jueves-santo`, name: 'Jueves Santo', date: iso(addDays(easter, -3)), kind: 'NO_LABORABLE', originalDate: null, anchor: addDays(easter, -3) },
    { key: `${year}-viernes-santo`, name: 'Viernes Santo', date: iso(addDays(easter, -2)), kind: 'FERIADO', originalDate: null, anchor: addDays(easter, -2) }
  );

  const offDays = new Set(list.map((h) => h.date));
  /** Día hábil escolar anterior a una fecha (sin fines de semana ni feriados). */
  const previousSchoolDay = (date: Date) => {
    let d = addDays(date, -1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || offDays.has(iso(d))) d = addDays(d, -1);
    return d;
  };
  /** Ese mismo día si es hábil; si no, el hábil anterior. */
  const sameOrPreviousSchoolDay = (date: Date) => (date.getUTCDay() === 0 || date.getUTCDay() === 6 || offDays.has(iso(date)) ? previousSchoolDay(date) : date);

  const result: HolidaySuggestion[] = list.map(({ actTitle, anchor, ...holiday }) => ({
    ...holiday,
    // El acto se hace el día hábil anterior a la efeméride (la fecha histórica, no la trasladada).
    act: actTitle ? { title: actTitle, date: iso(previousSchoolDay(addDays(anchor, 1))) } : null,
  }));
  for (const def of SCHOOL_ONLY) {
    const date = utc(year, def.month, def.day);
    result.push({ key: `${year}-${def.id}`, name: def.name, date: iso(date), kind: 'EFEMERIDE', originalDate: null, act: { title: def.act, date: iso(sameOrPreviousSchoolDay(date)) } });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
};

