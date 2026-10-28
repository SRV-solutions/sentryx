import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, CornerDownRight, Lock } from 'lucide-react';
import { apiGet, apiSend } from '../lib/api';
import { Badge, Empty, ErrorBox, Field, Sheet, Skeleton, fmtDate, useToast } from '../ui';
import { CONDUCT_KINDS, CONDUCT_KIND_LABELS, CONDUCT_KINDS_WITH_QUANTITY, type ConductKind } from './types';
import { useStudentSubjects } from './StudentSubjects';

export interface ConductRow {
  id: number;
  occurredOn: string;
  kind: ConductKind;
  kindLabel: string;
  quantity: number | null;
  description: string;
  measures: string | null;
  visibleToFamily: boolean;
  subject: { id: number; name: string } | null;
  division: { id: number; name: string } | null;
  createdAt: string;
  createdBy: { id: number; firstName: string; lastName: string } | null;
  notifiedAt: string | null;
  refId: number | null;
  rectifications: ConductRow[];
}
interface ConductData { records: ConductRow[]; summary: { amonestaciones: number; suspensionDays: number; byKind: Partial<Record<ConductKind, number>> }; canCreate: boolean }

type Tone = 'ok' | 'warn' | 'danger' | 'info';
const toneOf = (k: ConductKind): Tone => (k === 'RECONOCIMIENTO' ? 'ok' : k === 'AMONESTACION' || k === 'SUSPENSION' ? 'danger' : k === 'APERCIBIMIENTO' ? 'warn' : 'info');
const qtyText = (k: ConductKind, n: number | null) => (n == null ? null : k === 'SUSPENSION' ? `${n} ${n === 1 ? 'día' : 'días'}` : `${n} ${n === 1 ? 'amonestación' : 'amonestaciones'}`);
// Fecha local (no UTC): a la noche en Argentina toISOString ya da "mañana" y la API rechaza fechas futuras.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const byName = (p: ConductRow['createdBy']) => (p ? `${p.firstName} ${p.lastName}` : 'la escuela');

const emptyForm = () => ({ occurredOn: today(), kind: 'OBSERVACION' as ConductKind, quantity: 1, fixQty: false, subjectId: '' as number | '', description: '', measures: '', visibleToFamily: true, notifyFamily: true });

/** Alta de un registro (o rectificación de uno existente). Pide confirmación: después no se puede borrar. */
const ConductForm = ({ studentId, studentName, rectify, onClose }: { studentId: number; studentName: string; rectify: ConductRow | null; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const subjects = useStudentSubjects(studentId);
  const [f, setF] = useState(() => ({ ...emptyForm(), ...(rectify ? { kind: 'RECTIFICACION' as ConductKind, quantity: rectify.quantity ?? 1, visibleToFamily: rectify.visibleToFamily, subjectId: (rectify.subject?.id ?? '') as number | '' } : {}) }));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  // Rectificar una amonestación o suspensión puede corregir la cantidad (el resumen pasa a usar la nueva; 0 = sin efecto).
  const canFixQty = !!rectify && CONDUCT_KINDS_WITH_QUANTITY.includes(rectify.kind);
  // La rectificación de un registro interno queda interna (la API lo fuerza igual).
  const lockedInternal = !!rectify && !rectify.visibleToFamily;
  const needsQty = CONDUCT_KINDS_WITH_QUANTITY.includes(f.kind) || (canFixQty && f.fixQty);
  const save = useMutation({
    mutationFn: () => apiSend<ConductRow>('POST', `/school/students/${studentId}/conduct`, {
      occurredOn: f.occurredOn,
      kind: f.kind,
      ...(needsQty ? { quantity: f.quantity } : {}),
      ...(f.subjectId ? { subjectId: f.subjectId } : {}),
      description: f.description.trim(),
      ...(f.measures.trim() ? { measures: f.measures.trim() } : {}),
      visibleToFamily: f.visibleToFamily && !lockedInternal,
      notifyFamily: f.visibleToFamily && f.notifyFamily && !lockedInternal,
      ...(rectify ? { refId: rectify.id } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-conduct', studentId] });
      toast(f.visibleToFamily && f.notifyFamily && !lockedInternal ? 'Registro guardado. Le avisamos a la familia.' : 'Registro guardado');
      onClose();
    },
    onError: (e: Error) => (setError(e.message), setConfirming(false)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (f.description.trim().length < 3) return setError('Contá qué pasó (al menos 3 caracteres).');
    if (f.occurredOn > today()) return setError('La fecha no puede ser futura.');
    if (needsQty && !(f.quantity >= (rectify ? 0 : 1) && f.quantity <= 99)) return setError(rectify ? 'La cantidad corregida va de 0 a 99.' : 'La cantidad va de 1 a 99.');
    if (!confirming) return setConfirming(true);
    save.mutate();
  };
  return (
    <Sheet open onClose={onClose} title={rectify ? 'Rectificar registro' : `Registrar · ${studentName}`}>
      <form className="stack" onSubmit={submit}>
        {rectify && (
          <div className="alert alert-info small">
            <div className="grow">
              <b>{rectify.kindLabel} del {fmtDate(rectify.occurredOn)}</b>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{rectify.description}</div>
              <div className="xs muted" style={{ marginTop: 4 }}>El registro original queda como está; la rectificación se muestra debajo.</div>
            </div>
          </div>
        )}
        <div className="grid grid-2">
          <Field label="Fecha"><input className="input" type="date" required max={today()} value={f.occurredOn} onChange={(e) => setF({ ...f, occurredOn: e.target.value })} disabled={confirming} /></Field>
          {!rectify && (
            <Field label="Tipo">
              <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ConductKind })} disabled={confirming}>
                {CONDUCT_KINDS.filter((k) => k !== 'RECTIFICACION').map((k) => <option key={k} value={k}>{CONDUCT_KIND_LABELS[k]}</option>)}
              </select>
            </Field>
          )}
          {needsQty && (
            <Field label={canFixQty ? (rectify!.kind === 'SUSPENSION' ? 'Días de suspensión correctos' : 'Cantidad correcta de amonestaciones') : f.kind === 'SUSPENSION' ? 'Días de suspensión' : 'Cantidad de amonestaciones'}>
              <input className="input" type="number" inputMode="numeric" min={rectify ? 0 : 1} max={99} required value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} disabled={confirming} />
            </Field>
          )}
          <Field label="Materia (opcional)">
            <select className="select" value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value ? Number(e.target.value) : '' })} disabled={confirming}>
              <option value="">{subjects.isLoading ? 'Cargando…' : 'Ninguna'}</option>
              {subjects.data?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label={rectify ? 'Qué se corrige' : 'Qué pasó'}>
          <textarea className="input" rows={4} required minLength={3} maxLength={5000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} disabled={confirming}
            placeholder={rectify ? 'Ej: la fecha correcta es el 12/5; la amonestación queda sin efecto por…' : 'Describí el hecho con datos concretos.'} />
        </Field>
        <Field label="Medida / acuerdo (opcional)">
          <textarea className="input" rows={2} maxLength={5000} value={f.measures} onChange={(e) => setF({ ...f, measures: e.target.value })} disabled={confirming} placeholder="Ej: reunión con la familia, trabajo reflexivo…" />
        </Field>
        {canFixQty && (
          <label className="check"><input type="checkbox" checked={f.fixQty} onChange={(e) => setF({ ...f, fixQty: e.target.checked })} disabled={confirming} /> Corregir la cantidad ({qtyText(rectify!.kind, rectify!.quantity)})</label>
        )}
        <label className="check" style={{ opacity: lockedInternal ? 0.5 : 1 }}><input type="checkbox" checked={f.visibleToFamily && !lockedInternal} onChange={(e) => setF({ ...f, visibleToFamily: e.target.checked })} disabled={confirming || lockedInternal} /> Visible para la familia y el estudiante</label>
        <label className="check" style={{ opacity: f.visibleToFamily ? 1 : 0.5 }}>
          <input type="checkbox" checked={f.visibleToFamily && f.notifyFamily} disabled={!f.visibleToFamily || confirming} onChange={(e) => setF({ ...f, notifyFamily: e.target.checked })} /> Avisar a la familia
        </label>
        {lockedInternal ? (
          <p className="xs muted">El registro original es interno: la rectificación también queda interna y no se avisa a la familia.</p>
        ) : (
          !f.visibleToFamily && <p className="xs muted">Queda como registro interno: solo lo ve el personal con acceso a convivencia.</p>
        )}
        {error && <div className="alert alert-danger small">{error}</div>}
        {confirming ? (
          <div className="alert alert-warn small stack" style={{ gap: 10, flexDirection: 'column', alignItems: 'stretch' }}>
            <div><b>Una vez guardado no se puede borrar</b> ni editar. Si después encontrás un error, vas a tener que agregar una rectificación.</div>
            <div className="row">
              <button type="button" className="btn btn-ghost grow" onClick={() => setConfirming(false)} disabled={save.isPending}>Volver a revisar</button>
              <button className="btn grow" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Confirmar y guardar'}</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-block">{rectify ? 'Guardar rectificación' : 'Guardar registro'}</button>
        )}
      </form>
    </Sheet>
  );
};

const RecordBody = ({ r, staffView }: { r: ConductRow; staffView: boolean }) => (
  <>
    {r.description && <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{r.description}</p>}
    {r.measures && <p className="small" style={{ whiteSpace: 'pre-wrap' }}><b>Medida / acuerdo:</b> {r.measures}</p>}
    <div className="xs muted">
      Cargado por {byName(r.createdBy)} · {fmtDate(r.createdAt)}
      {staffView && r.notifiedAt && ' · familia avisada'}
    </div>
  </>
);

/**
 * Historial de convivencia del estudiante (solo agregar: la base rechaza ediciones y borrados).
 * Familia y estudiante ven solo lo visible para la familia (lo filtra la API).
 */
export const ConductPanel = ({ studentId, studentName, staffView }: { studentId: number; studentName: string; staffView: boolean }) => {
  const q = useQuery({ queryKey: ['student-conduct', studentId], queryFn: () => apiGet<ConductData>(`/school/students/${studentId}/conduct`) });
  const [form, setForm] = useState<{ rectify: ConductRow | null } | null>(null);
  if (q.isLoading) return <Skeleton count={3} h={90} />;
  if (q.error) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const { records, summary, canCreate } = q.data!;
  const kinds = (Object.entries(summary.byKind) as Array<[ConductKind, number]>).filter(([k, n]) => n > 0 && k !== 'RECTIFICACION');

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div className="row wrap" style={{ gap: 6 }}>
          <Badge tone={summary.amonestaciones ? 'danger' : undefined}>{summary.amonestaciones} {summary.amonestaciones === 1 ? 'amonestación' : 'amonestaciones'} en el ciclo</Badge>
          <Badge tone={summary.suspensionDays ? 'danger' : undefined}>{summary.suspensionDays} {summary.suspensionDays === 1 ? 'día' : 'días'} de suspensión</Badge>
          {kinds.map(([k, n]) => <Badge key={k} tone={toneOf(k)}>{CONDUCT_KIND_LABELS[k]}: {n}</Badge>)}
        </div>
        {canCreate && <button className="btn btn-sm" onClick={() => setForm({ rectify: null })}><Plus size={16} /> Registrar</button>}
      </div>
      <p className="xs muted row" style={{ gap: 6 }}><Lock size={12} /> El historial de convivencia no se puede editar ni borrar. Para corregir un error, agregá una rectificación.</p>

      {!records.length ? (
        <Empty title="Sin registros de convivencia" text={canCreate ? 'Acá queda el historial: observaciones, acuerdos, sanciones y también reconocimientos.' : 'Cuando la escuela registre algo, aparece acá.'} icon={<ShieldCheck size={36} strokeWidth={1.5} />} />
      ) : (
        <div className="stack">
          {records.map((r) => (
            <div key={r.id} className="card card-pad stack" style={{ gap: 8, borderLeft: `4px solid var(--${toneOf(r.kind) === 'info' ? 'primary' : toneOf(r.kind)})` }}>
              <div className="row-between wrap" style={{ gap: 6 }}>
                <div className="row wrap" style={{ gap: 6 }}>
                  <Badge tone={toneOf(r.kind)}>{r.kindLabel || CONDUCT_KIND_LABELS[r.kind]}</Badge>
                  {qtyText(r.kind, r.quantity) && <Badge tone="danger">{qtyText(r.kind, r.quantity)}</Badge>}
                  {staffView && !r.visibleToFamily && <Badge>Interno</Badge>}
                  {r.rectifications.length > 0 && <Badge tone="warn">Rectificado</Badge>}
                </div>
                <span className="small muted">{fmtDate(r.occurredOn, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              {(r.subject || r.division) && <div className="xs muted">{[r.subject?.name, r.division?.name].filter(Boolean).join(' · ')}</div>}
              <RecordBody r={r} staffView={staffView} />
              {r.rectifications.map((x) => (
                <div key={x.id} className="row" style={{ alignItems: 'flex-start', gap: 8, paddingLeft: 4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <CornerDownRight size={16} className="muted" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div className="stack grow" style={{ gap: 4 }}>
                    <div className="small"><b>Rectificado el {fmtDate(x.createdAt)}</b>{x.occurredOn !== r.occurredOn ? ` · fecha del hecho ${fmtDate(x.occurredOn)}` : ''}{x.quantity != null && ` · cantidad correcta: ${x.quantity === 0 ? 'queda sin efecto' : qtyText(r.kind, x.quantity)}`}{staffView && !x.visibleToFamily && <> <Badge>Interno</Badge></>}</div>
                    <RecordBody r={x} staffView={staffView} />
                  </div>
                </div>
              ))}
              {canCreate && <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setForm({ rectify: r })}>Rectificar</button>}
            </div>
          ))}
        </div>
      )}
      {form && <ConductForm studentId={studentId} studentName={studentName} rectify={form.rectify} onClose={() => setForm(null)} />}
    </div>
  );
};
