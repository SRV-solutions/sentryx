import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, MailWarning } from 'lucide-react';
import { apiSend } from '../lib/api';
import { Card, Field, Sheet, fmtDate, useToast } from '../ui';

/** PUT /students/:id/email: lo usan la familia (solo si falta), el propio estudiante (siempre) y el personal (users:update). */
const useSetStudentEmail = (studentId: number, replace: boolean, onDone?: () => void) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (email: string) => apiSend<{ email: string; hasEmail: true }>('PUT', `/school/students/${studentId}/email`, { email: email.trim().toLowerCase() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student', studentId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['alerts-no-email'] });
      toast(replace ? 'Email actualizado.' : 'Email cargado. Ya puede recuperar su contraseña si la olvida.');
      onDone?.();
    },
  });
};

/** Campo + botón. El error de la API (ej: "ese email ya lo usa la cuenta de la mamá") se muestra abajo. */
export const LoadEmailForm = ({ studentId, onDone, autoFocus, hint, replace = false }: { studentId: number; onDone?: () => void; autoFocus?: boolean; hint?: string; replace?: boolean }) => {
  const [email, setEmail] = useState('');
  const save = useSetStudentEmail(studentId, replace, () => (setEmail(''), onDone?.()));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) save.mutate(email);
  };
  return (
    <form className="stack" style={{ gap: 8 }} onSubmit={submit}>
      <div className="row wrap" style={{ gap: 8 }}>
        <input className="input grow" type="email" required autoFocus={autoFocus} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={replace ? 'Email nuevo' : 'email@ejemplo.com'} maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email del estudiante" />
        <button className="btn btn-sm" disabled={save.isPending || !email.trim()}>{save.isPending ? 'Guardando…' : replace ? 'Guardar email' : 'Cargar email'}</button>
      </div>
      {hint && <span className="xs muted">{hint}</span>}
      {save.error && <div className="alert alert-danger small">{save.error.message}</div>}
    </form>
  );
};

export interface StudentEmailAccount { exists: boolean; hasEmail?: boolean; email?: string | null; emailChangeRequestedAt?: string | null; emailChangeReason?: string | null }

/** Hay que mostrarlo arriba de todo (no solo en "Datos"): falta el email, o la escuela le pidió al estudiante que lo cambie. */
export const emailNeedsAttention = (account: StudentEmailAccount | undefined, self: boolean) =>
  !!account?.exists && (account.hasEmail === false || (self && !!account.emailChangeRequestedAt));

/**
 * Email de la cuenta del estudiante, para la familia y el propio estudiante:
 * - familia: lo carga solo si falta; si ya tiene, lo ve (sin poder cambiarlo: lo cambia el estudiante o la escuela).
 * - estudiante: "Mi email", lo cambia cuando quiera; si la escuela le pidió cambiarlo, el formulario arranca abierto.
 */
export const StudentEmailCard = ({ studentId, firstName, self, account }: { studentId: number; firstName: string; self: boolean; account: StudentEmailAccount }) => {
  const [changing, setChanging] = useState(false);
  if (!account.exists) return null;
  const requested = !!account.emailChangeRequestedAt;
  const reason = account.emailChangeReason;

  if (account.hasEmail === false && !(self && requested))
    return (
      <div className="alert alert-warn no-print" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <MailWarning size={20} style={{ flexShrink: 0 }} />
          <div className="small grow">
            {self
              ? <><b>Tu cuenta no tiene email:</b> podés entrar con tu DNI y cambiar la contraseña, pero si la olvidás no vas a poder recuperarla.</>
              : <><b>{firstName} no tiene email en su cuenta:</b> puede entrar con su DNI y cambiar la contraseña, pero si la olvida no va a poder recuperarla.</>}
          </div>
        </div>
        <LoadEmailForm studentId={studentId} hint={self ? 'Usá un email tuyo (no el de tu mamá o papá si ya lo usan en Sentryx).' : `Tiene que ser un email propio de ${firstName}: el tuyo ya está en tu cuenta. Después solo lo puede cambiar ${firstName} o la escuela.`} />
      </div>
    );

  if (self && requested)
    return (
      <div className="alert alert-warn no-print" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <MailWarning size={20} style={{ flexShrink: 0 }} />
          <div className="small grow stack" style={{ gap: 4 }}>
            <b>La escuela te pidió que cambies tu email</b>
            <span>{reason || 'Tiene que ser un email tuyo y real: es el que vas a usar para recuperar la contraseña.'}</span>
            <span className="xs">Email actual: {account.email || (account.hasEmail ? 'cargado' : 'sin email')}{account.emailChangeRequestedAt && ` · pedido el ${fmtDate(account.emailChangeRequestedAt, { day: 'numeric', month: 'long' })}`}</span>
          </div>
        </div>
        <LoadEmailForm studentId={studentId} replace={!!account.hasEmail} hint="Usá un email tuyo que revises (no el de tu mamá o papá si ya lo usan en Sentryx)." />
      </div>
    );

  // Ya tiene email y nada pendiente: tarjeta tranquila en "Datos".
  return (
    <Card>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row-between wrap" style={{ gap: 8 }}>
          <h3 className="h3 row"><Mail size={18} /> {self ? 'Mi email' : `Email de ${firstName}`}</h3>
          {self && !changing && <button className="btn btn-sm btn-ghost" onClick={() => setChanging(true)}>Cambiar email</button>}
        </div>
        <div className="small" style={{ wordBreak: 'break-all' }}>{account.email || (self ? 'Sin email' : `${firstName} ya tiene email en su cuenta.`)}</div>
        {self
          ? changing && <LoadEmailForm studentId={studentId} replace autoFocus onDone={() => setChanging(false)} hint="Con tu email podés recuperar la contraseña si la olvidás. Seguís entrando con tu DNI." />
          : <p className="xs muted">Si hay que cambiarlo, lo cambia {firstName} desde su perfil o la escuela.{requested && ' La escuela ya le pidió que lo actualice.'}</p>}
      </div>
    </Card>
  );
};

/** Hoja para cargar (o cambiar) el email desde listados del personal (Alertas → "Emails de estudiantes"). */
export const LoadEmailSheet = ({ studentId, name, noAccount, replace, onClose }: { studentId: number | null; name: string; noAccount?: boolean; replace?: boolean; onClose: () => void }) => (
  <Sheet open={!!studentId} onClose={onClose} title={`Email de ${name}`}>
    {studentId && (
      <div className="stack">
        <p className="small muted">
          {noAccount ? 'Todavía no tiene cuenta: al cargar el email se crea su cuenta con ese email (ingresa con su DNI).'
            : replace ? 'Reemplaza el email actual de su cuenta. Sigue entrando con su DNI; si había un pedido de cambio, queda resuelto.'
            : 'Con un email propio puede recuperar su contraseña si la olvida. Sigue entrando con su DNI.'}
        </p>
        <Field label={replace ? 'Email nuevo del estudiante' : 'Email del estudiante'}>
          <LoadEmailForm studentId={studentId} onDone={onClose} autoFocus replace={replace} />
        </Field>
      </div>
    )}
  </Sheet>
);
