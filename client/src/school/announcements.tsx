import { useEffect, useState, type ReactNode } from 'react';
import { Landmark, GraduationCap, BookOpen, CalendarCheck, ShieldAlert, FileText, PartyPopper, CircleHelp, X } from 'lucide-react';
import { ANNOUNCEMENT_CATEGORY_LABELS, type AnnouncementCategory, type AudienceTarget } from './types';

/** Compartido por la bandeja, el compositor, el detalle y las conversaciones de comunicados. */

/**
 * Un color por tipo para reconocerlos de un vistazo en la bandeja. El fondo es el tono al 14% y el texto
 * se mezcla con --text para que se lea igual en claro y oscuro (sin tocar app.css).
 */
const CATEGORY_TONES: Record<AnnouncementCategory, { color: string; icon: typeof Landmark }> = {
  INSTITUCIONAL: { color: '#0B78FB', icon: Landmark },
  ACADEMICO: { color: '#7C3AED', icon: GraduationCap },
  AULICO: { color: '#0D9488', icon: BookOpen },
  ASISTENCIA: { color: '#D97706', icon: CalendarCheck },
  CONVIVENCIA: { color: '#E11D48', icon: ShieldAlert },
  ADMINISTRATIVO: { color: '#64748B', icon: FileText },
  EVENTO: { color: '#DB2777', icon: PartyPopper },
  CONSULTA: { color: '#16A34A', icon: CircleHelp },
};

export const categoryLabel = (c?: string | null) => ANNOUNCEMENT_CATEGORY_LABELS[(c ?? 'INSTITUCIONAL') as AnnouncementCategory] ?? c ?? '';

export const CategoryBadge = ({ category }: { category?: string | null }) => {
  const tone = CATEGORY_TONES[(category ?? 'INSTITUCIONAL') as AnnouncementCategory] ?? CATEGORY_TONES.INSTITUCIONAL;
  const Icon = tone.icon;
  return (
    <span className="badge" style={{ background: `color-mix(in srgb, ${tone.color} 14%, transparent)`, color: `color-mix(in srgb, ${tone.color} 78%, var(--text))` }}>
      <Icon size={12} /> {categoryLabel(category)}
    </span>
  );
};

/** Audiencias "de a una persona": por defecto se permiten respuestas. Las masivas arrancan cerradas. */
export const PERSONAL_AUDIENCES = ['STUDENTS', 'GUARDIANS', 'USERS'] as const;
/** Audiencias armadas desde alumnos: se elige si llega a familias, estudiantes o ambos. */
export const TARGETABLE_AUDIENCES = ['SCHOOL', 'LEVEL', 'DIVISION', 'STUDENTS'] as const;
export const DEFAULT_TARGET: AudienceTarget = 'FAMILIES';

/** Persona elegida en un selector (alumno, familia, colega). name null = todavía no se conoce (edición). */
export interface Picked { id: number; name: string | null; detail?: string | null }

/** Chips de lo elegido, cada uno con su ✕ para quitarlo. */
export const PickedChips = ({ items, onRemove, empty, fallback = 'Persona elegida' }: { items: Picked[]; onRemove: (id: number) => void; empty?: ReactNode; fallback?: string }) =>
  items.length ? (
    <div className="row wrap" style={{ gap: 6 }}>
      {items.map((p) => (
        <span key={p.id} className="chip active row" style={{ gap: 6, paddingRight: 6, minHeight: 32, cursor: 'default' }}>
          <span className="truncate" style={{ maxWidth: 220 }}>{p.name ?? fallback}</span>
          <button type="button" onClick={() => onRemove(p.id)} aria-label={`Quitar a ${p.name ?? fallback}`} style={{ background: 'none', border: 0, color: 'inherit', padding: 2, cursor: 'pointer', display: 'inline-flex' }}>
            <X size={14} />
          </button>
        </span>
      ))}
    </div>
  ) : (
    <>{empty ?? null}</>
  );

/** Valor con retardo, para no consultar en cada tecla. */
export const useDebounced = <T,>(value: T, ms = 300) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

/** Normaliza para buscar sin tildes ni mayúsculas (filtros locales). */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Re: Título" → "Título" (los hilos de respuesta guardan el asunto con ese prefijo). */
export const stripRe = (s: string) => s.replace(/^re:\s*/i, '');
