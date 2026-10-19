/** Tipos del calendario institucional. */
export type EventKind = 'ACTO' | 'FERIADO' | 'NO_LABORABLE' | 'EVENTO' | 'REUNION' | 'SALIDA' | 'OTRO';
export type EventAudience = 'STAFF' | 'COMMUNITY';

export interface EventManagerRow { id: number; userId: number; task: string | null; User?: { id: number; firstName: string; lastName: string; avatar: string | null } }
export interface SchoolEvent {
  id: number;
  title: string;
  kind: EventKind;
  kindLabel: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string;
  levelIds: number[];
  divisionIds: number[];
  audience: EventAudience;
  holidayKey: string | null;
  cancelled: boolean;
  isManager?: boolean;
  canWork?: boolean;
  Managers?: EventManagerRow[];
}
export interface EventPostRow {
  id: number;
  kind: 'NOTA' | 'TAREA' | 'ARCHIVO' | 'LINK';
  body: string;
  url: string | null;
  fileIds: number[];
  files: Array<{ id: number; name: string; url: string; size: number; mimeType: string }>;
  assigneeId: number | null;
  dueDate: string | null;
  done: boolean;
  createdAt: string;
  authorId: number;
  Author?: { id: number; firstName: string; lastName: string; avatar: string | null };
}

export const EVENT_KIND_LABELS: Record<EventKind, string> = { ACTO: 'Acto', FERIADO: 'Feriado', NO_LABORABLE: 'No laborable', EVENTO: 'Evento', REUNION: 'Reunión', SALIDA: 'Salida', OTRO: 'Otro' };
export const CREATABLE_KINDS: EventKind[] = ['ACTO', 'EVENTO', 'REUNION', 'SALIDA', 'FERIADO', 'NO_LABORABLE', 'OTRO'];

/** "2026-06-19" → Date local al mediodía (evita corrimientos por zona horaria). */
export const dateOf = (iso: string) => new Date(`${iso}T12:00:00`);
export const dayLabel = (iso: string) => dateOf(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
