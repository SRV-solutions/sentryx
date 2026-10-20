/** Fechas y textos en español rioplatense, sin librerías: Intl viene con el sistema. */
const dateOf = (d: string | Date) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d));

export const fmtDate = (d: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => dateOf(d).toLocaleDateString('es-AR', opts);
export const fmtTime = (d: string | Date) => dateOf(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (d: string | Date) => `${fmtDate(d)} ${fmtTime(d)}`;

export const timeAgo = (d: string | Date) => {
  const diff = (Date.now() - dateOf(d).getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `hace ${Math.floor(diff / 86400)} d`;
  return fmtDate(d);
};

/** Fecha de hoy en hora local (no UTC) con formato AAAA-MM-DD. */
export const localToday = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const dayLabel = (iso: string) => {
  if (iso === localToday()) return 'Hoy';
  if (iso === localToday(-1)) return 'Ayer';
  return fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
};

export const fullName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : '');
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
};
