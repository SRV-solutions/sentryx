/** Alta y edición de un evento del calendario. */
import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '../lib/api';
import { Field, Sheet, useToast } from '../ui';
import type { Structure } from './types';
import { CREATABLE_KINDS, EVENT_KIND_LABELS, EventAudience, EventKind, SchoolEvent } from './events';

type Form = {
  title: string;
  kind: EventKind;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  levelIds: number[];
  audience: EventAudience;
};

const fromEvent = (e?: SchoolEvent | null, date?: string): Form => ({
  title: e?.title ?? '',
  kind: e?.kind ?? 'ACTO',
  date: e?.date ?? date ?? new Date().toISOString().slice(0, 10),
  endDate: e?.endDate ?? '',
  startTime: e?.startTime ?? '',
  endTime: e?.endTime ?? '',
  location: e?.location ?? '',
  description: e?.description ?? '',
  levelIds: e?.levelIds ?? [],
  audience: e?.audience ?? 'COMMUNITY',
});

export const EventFormSheet = ({ open, onClose, event, onSaved }: { open: boolean; onClose: () => void; event?: SchoolEvent | null; onSaved?: (e: SchoolEvent) => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const [f, setF] = useState<Form>(fromEvent(event));
  const [error, setError] = useState('');
  const [lastKey, setLastKey] = useState<string>('');
  const key = `${open}-${event?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setF(fromEvent(event));
    setError('');
  }
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, endDate: f.endDate || null, startTime: f.startTime || null, endTime: f.endTime || null, location: f.location || null };
      return event ? apiSend<SchoolEvent>('PATCH', `/school/events/${event.id}`, body) : apiSend<SchoolEvent>('POST', '/school/events', body);
    },
    onSuccess: (saved) => {
      toast(event ? 'Evento actualizado' : 'Evento creado');
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['event'] });
      onSaved?.(saved);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Sheet open={open} onClose={onClose} title={event ? 'Editar evento' : 'Nuevo evento'}>
      <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), setError(''), save.mutate())}>
        <Field label="Título"><input className="input" required maxLength={160} placeholder="Ej: Acto del 25 de Mayo" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Tipo">
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {CREATABLE_KINDS.map((k) => <button type="button" key={k} className={`chip ${f.kind === k ? 'active' : ''}`} onClick={() => setF({ ...f, kind: k })}>{EVENT_KIND_LABELS[k]}</button>)}
          </div>
        </Field>
        <div className="grid grid-2">
          <Field label="Fecha"><input className="input" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Hasta (si dura varios días)"><input className="input" type="date" min={f.date} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
          <Field label="Hora de inicio"><input className="input" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
          <Field label="Hora de fin"><input className="input" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
        </div>
        <Field label="Lugar"><input className="input" maxLength={160} placeholder="Ej: Patio central" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <Field label="Niveles" hint="Ninguno elegido = toda la institución.">
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {structure.data?.levels.map((l) => (
              <button type="button" key={l.id} className={`chip ${f.levelIds.includes(l.id) ? 'active' : ''}`} onClick={() => setF({ ...f, levelIds: f.levelIds.includes(l.id) ? f.levelIds.filter((x) => x !== l.id) : [...f.levelIds, l.id] })}>{l.name}</button>
            ))}
          </div>
        </Field>
        <Field label="¿Quién lo ve?">
          <div className="chips">
            <button type="button" className={`chip ${f.audience === 'COMMUNITY' ? 'active' : ''}`} onClick={() => setF({ ...f, audience: 'COMMUNITY' })}>Toda la comunidad</button>
            <button type="button" className={`chip ${f.audience === 'STAFF' ? 'active' : ''}`} onClick={() => setF({ ...f, audience: 'STAFF' })}>Solo el personal</button>
          </div>
        </Field>
        <Field label="Descripción"><textarea className="textarea" rows={3} maxLength={5000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {error && <div className="alert alert-danger small">{error}</div>}
        <button className="btn btn-block" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Sheet>
  );
};
