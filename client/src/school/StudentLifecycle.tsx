/** Recorrido del alumno en la escuela: cambio de curso, baja con motivo y reincorporación. */
import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, UserMinus, UserCheck } from 'lucide-react';
import { apiGet, apiSend } from '../lib/api';
import { Card, Field, Sheet, useToast, fmtDate } from '../ui';
import type { Structure } from './types';
import { CredentialsSheet, type Credential } from './CredentialsSheet';

export interface LeaveReason { code: string; label: string }

const useStructure = () => useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
export const useLeaveReasons = () => useQuery({ queryKey: ['leave-reasons'], queryFn: () => apiGet<LeaveReason[]>('/school/students/leave-reasons'), staleTime: Infinity });

/** Elegir un curso del ciclo actual, agrupado por nivel. */
const DivisionSelect = ({ value, onChange, exclude }: { value: number | ''; onChange: (id: number | '') => void; exclude?: number }) => {
  const structure = useStructure();
  return (
    <select className="select" required value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}>
      <option value="">Elegí un curso</option>
      {structure.data?.levels.map((level) => (
        <optgroup key={level.id} label={level.name}>
          {structure.data!.divisions.filter((d) => d.levelId === level.id && d.id !== exclude).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
};

const invalidateStudents = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['student'] });
  qc.invalidateQueries({ queryKey: ['students'] });
  qc.invalidateQueries({ queryKey: ['structure'] });
};

/** Cambio de curso dentro del mismo ciclo (uno o varios alumnos). */
export const TransferSheet = ({ studentIds, currentDivisionId, title, open, onClose, onDone }: { studentIds: number[]; currentDivisionId?: number; title: string; open: boolean; onClose: () => void; onDone?: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [divisionId, setDivisionId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  // Si pasa a Secundario se le crea la cuenta: la contraseña se muestra una sola vez (por eso la hoja vive fuera del Sheet).
  const [creds, setCreds] = useState<Credential[]>([]);
  const move = useMutation({
    mutationFn: () => apiSend<{ moved: number; target: string; accounts?: { created: number; skipped: number; credentials: Credential[] } }>('POST', '/school/students/transfer', { studentIds, divisionId, reason: reason || null }),
    onSuccess: (r) => {
      invalidateStudents(qc);
      const acc = r.accounts;
      toast(`${r.moved === 1 ? 'Alumno movido' : `${r.moved} alumnos movidos`} a ${r.target}${acc?.created ? ` · ${acc.created === 1 ? 'se creó su cuenta de estudiante' : `${acc.created} cuentas de estudiante creadas`}` : ''}${acc?.skipped ? ` · ${acc.skipped} sin cuenta (revisá el DNI)` : ''}`);
      if (acc?.credentials.length) setCreds(acc.credentials);
      onClose();
      onDone?.();
    },
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <>
      <Sheet open={open} onClose={onClose} title={title}>
        <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), move.mutate())}>
          <Field label="Curso nuevo"><DivisionSelect value={divisionId} onChange={setDivisionId} exclude={currentDivisionId} /></Field>
          <Field label="Motivo (opcional)"><input className="input" maxLength={200} placeholder="Ej: cambio de turno" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <p className="xs muted">Las notas y la asistencia ya cargadas se conservan. Desde ahora lo ven los docentes y preceptores del curso nuevo.</p>
          <button className="btn btn-block" disabled={!divisionId || move.isPending}>{move.isPending ? 'Moviendo…' : 'Cambiar de curso'}</button>
        </form>
      </Sheet>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} title="Cuentas de estudiantes" />
    </>
  );
};

interface LifecycleStudent { id: number; firstName: string; active?: boolean; leftAt?: string | null; leaveReason?: string | null; leaveNotes?: string | null }

/** Tarjeta de gestión (solo personal con permiso de editar usuarios). */
export const StudentLifecycleCard = ({ student, divisionId }: { student: LifecycleStudent; divisionId?: number }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const reasons = useLeaveReasons();
  const [sheet, setSheet] = useState<null | 'transfer' | 'withdraw' | 'reactivate'>(null);
  const [leave, setLeave] = useState({ reason: 'CAMBIO_DE_COLEGIO', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [returnTo, setReturnTo] = useState<number | ''>('');
  const [creds, setCreds] = useState<Credential[]>([]);
  const withdraw = useMutation({
    mutationFn: () => apiSend('POST', `/school/students/${student.id}/withdraw`, { ...leave, notes: leave.notes || null }),
    onSuccess: () => (invalidateStudents(qc), toast(`${student.firstName} quedó dado/a de baja. Se conserva su historial.`), setSheet(null)),
    onError: (e: Error) => toast(e.message, true),
  });
  const reactivate = useMutation({
    mutationFn: () => apiSend<{ credentials?: Credential[] }>('POST', `/school/students/${student.id}/reactivate`, { divisionId: returnTo }),
    onSuccess: (r) => (invalidateStudents(qc), toast(`${student.firstName} fue reincorporado/a`), r?.credentials?.length && setCreds(r.credentials), setSheet(null)),
    onError: (e: Error) => toast(e.message, true),
  });
  const inactive = student.active === false;
  const reasonLabel = reasons.data?.find((r) => r.code === student.leaveReason)?.label ?? student.leaveReason;

  return (
    <>
      {inactive ? (
        <div className="alert alert-warn row wrap" style={{ gap: 10 }}>
          <div className="grow small">
            <b>Dado/a de baja</b>{student.leftAt && ` el ${fmtDate(student.leftAt, { day: 'numeric', month: 'long', year: 'numeric' })}`}{reasonLabel && ` · ${reasonLabel}`}
            {student.leaveNotes && <div className="xs">{student.leaveNotes}</div>}
          </div>
          <button className="btn btn-sm" onClick={() => setSheet('reactivate')}><UserCheck size={16} /> Reincorporar</button>
        </div>
      ) : (
        <Card>
          <div className="row-between wrap" style={{ gap: 8 }}>
            <h3 className="h3">Curso y matrícula</h3>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setSheet('transfer')}><ArrowRightLeft size={16} /> Cambiar de curso</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setSheet('withdraw')}><UserMinus size={16} /> Dar de baja</button>
            </div>
          </div>
        </Card>
      )}

      <TransferSheet open={sheet === 'transfer'} onClose={() => setSheet(null)} studentIds={[student.id]} currentDivisionId={divisionId} title={`Cambiar de curso a ${student.firstName}`} />

      <Sheet open={sheet === 'withdraw'} onClose={() => setSheet(null)} title={`Dar de baja a ${student.firstName}`}>
        <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), withdraw.mutate())}>
          <Field label="Motivo">
            <select className="select" value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })}>
              {reasons.data?.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Fecha de baja"><input className="input" type="date" required value={leave.date} onChange={(e) => setLeave({ ...leave, date: e.target.value })} /></Field>
          <Field label="Observaciones (opcional)"><textarea className="textarea" rows={3} maxLength={1000} placeholder="Ej: pase al Colegio San José" value={leave.notes} onChange={(e) => setLeave({ ...leave, notes: e.target.value })} /></Field>
          <p className="xs muted">No se borra nada: el boletín, la asistencia y los mensajes quedan guardados. La familia deja de verlo en la app y su cuenta de estudiante (si tiene) se desactiva.</p>
          <button className="btn btn-danger btn-block" disabled={withdraw.isPending}>{withdraw.isPending ? 'Guardando…' : 'Confirmar baja'}</button>
        </form>
      </Sheet>

      <Sheet open={sheet === 'reactivate'} onClose={() => setSheet(null)} title={`Reincorporar a ${student.firstName}`}>
        <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), reactivate.mutate())}>
          <Field label="Curso del ciclo actual"><DivisionSelect value={returnTo} onChange={setReturnTo} /></Field>
          <button className="btn btn-block" disabled={!returnTo || reactivate.isPending}>{reactivate.isPending ? 'Guardando…' : 'Reincorporar'}</button>
        </form>
      </Sheet>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} title="Cuenta del estudiante" />
    </>
  );
};
