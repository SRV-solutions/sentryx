import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Mail, MailCheck, MailQuestion, ChevronRight, KeySquare } from 'lucide-react';
import { apiGet, apiSend } from '../lib/api';
import { useSchool } from './SchoolContext';
import { Badge, Chips, Empty, ErrorBox, Field, Sheet, Skeleton, fmtDate, timeAgo, useToast } from '../ui';
import { Entity, Action } from './permissions';
import { LoadEmailSheet } from './StudentEmailCard';
import { CredentialsSheet, type Credential } from './CredentialsSheet';

type EmailStatus = 'missing' | 'present' | 'all';

interface EmailRow {
  studentId: number;
  firstName: string;
  lastName: string;
  division: { id: number; name: string };
  account: 'NONE' | 'NO_EMAIL' | 'HAS_EMAIL';
  userId: number | null;
  login: string | null;
  /** Email real; null si no tiene o si quien mira no tiene contact_info:read (hasEmail igual avisa que hay uno). */
  email: string | null;
  hasEmail: boolean;
  emailChangeRequestedAt: string | null;
  emailChangeReason: string | null;
  guardians: Array<{ userId: number; name: string; relationship: string | null; hasEmail: boolean }>;
  noEmailNoticeAt: string | null;
}

const EMPTY: Record<EmailStatus, { title: string; text: string }> = {
  missing: { title: 'Todos tienen email 🎉', text: 'Ningún estudiante de Secundario de tus cursos tiene la cuenta sin email.' },
  present: { title: 'Nadie cargó email todavía', text: 'Cuando un estudiante, su familia o la escuela carguen el email, aparece acá.' },
  all: { title: 'Sin estudiantes', text: 'No hay estudiantes de Secundario en tus cursos este ciclo.' },
};

/**
 * Emails de las cuentas de estudiantes de Secundario: quién no tiene (o no tiene cuenta), quién sí y cuál.
 * Se calcula en el momento (no son alertas guardadas): las filas "sin email" desaparecen solas cuando alguien lo carga.
 */
export const NoEmailPanel = () => {
  const { can } = useSchool();
  const qc = useQueryClient();
  const toast = useToast();
  const canNotify = can(Entity.ALERTS, Action.UPDATE);
  const canEdit = can(Entity.USERS, Action.UPDATE);
  const canCreate = can(Entity.USERS, Action.CREATE);
  // Pedir el cambio es para quien puede ver los emails (directivos, preceptoría, secretaría; docentes no).
  const canRequest = can(Entity.CONTACT_INFO, Action.READ);
  const canSelect = canNotify || canRequest;
  const [status, setStatus] = useState<EmailStatus>('missing');
  const q = useQuery({ queryKey: ['alerts-no-email', status], queryFn: () => apiGet<{ data: EmailRow[]; total: number }>(`/school/alerts/no-email?status=${status}`) });
  const [division, setDivision] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [force, setForce] = useState(false);
  const [editing, setEditing] = useState<EmailRow | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [creds, setCreds] = useState<Credential[]>([]);

  const rows = q.data?.data ?? [];
  const divisions = useMemo(() => [...new Map(rows.map((r) => [r.division.id, r.division])).values()], [rows]);
  const visible = division ? rows.filter((r) => r.division.id === division) : rows;
  // Agrupado por curso, en el orden que manda la API.
  const groups = useMemo(() => {
    const m = new Map<number, { id: number; name: string; items: EmailRow[] }>();
    for (const r of visible) (m.get(r.division.id) ?? m.set(r.division.id, { id: r.division.id, name: r.division.name, items: [] }).get(r.division.id)!).items.push(r);
    return [...m.values()];
  }, [visible]);
  // Sin cuenta no hay a quién avisar ni a quién pedirle nada.
  const selectable = visible.filter((r) => r.account !== 'NONE');
  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.studentId));
  const picked = rows.filter((r) => selected.has(r.studentId) && r.account !== 'NONE');
  const pickedNoEmail = picked.filter((r) => r.account === 'NO_EMAIL');
  const visibleNoEmail = visible.filter((r) => r.account === 'NO_EMAIL');

  const resetSelection = () => setSelected(new Set());
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => { const n = new Set(s); selectable.forEach((r) => (allChecked ? n.delete(r.studentId) : n.add(r.studentId))); return n; });
  const refresh = () => (qc.invalidateQueries({ queryKey: ['alerts-no-email'] }), qc.invalidateQueries({ queryKey: ['dashboard'] }));

  const notify = useMutation({
    // Sin selección: los sin email visibles (o todos los del alcance si no hay filtro de curso: lo resuelve la API).
    mutationFn: () => {
      const ids = selected.size ? pickedNoEmail.map((r) => r.studentId) : division ? visibleNoEmail.map((r) => r.studentId) : undefined;
      return apiSend<{ notified: number; guardians: number; skipped: number }>('POST', '/school/alerts/no-email/notify', { ...(ids ? { studentIds: ids } : {}), ...(force ? { force: true } : {}) });
    },
    onSuccess: (r) => {
      toast(r.notified
        ? `Listo: avisamos a ${r.guardians} ${r.guardians === 1 ? 'familiar' : 'familiares'} de ${r.notified} ${r.notified === 1 ? 'estudiante' : 'estudiantes'}${r.skipped ? ` · ${r.skipped} sin avisar (sin cuenta o avisados hace menos de 7 días)` : ''}.`
        : `No se envió ningún aviso${r.skipped ? `: ${r.skipped} sin cuenta o avisados hace menos de 7 días` : ''}.`);
      resetSelection();
      refresh();
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const requestChange = useMutation({
    mutationFn: () => apiSend<{ requested: number; skipped: number }>('POST', '/school/alerts/student-emails/request-change', { studentIds: picked.map((r) => r.studentId), ...(reason.trim() ? { reason: reason.trim() } : {}) }),
    onSuccess: (r) => {
      toast(r.requested
        ? `Listo: le pedimos a ${r.requested === 1 ? '1 estudiante' : `${r.requested} estudiantes`} que cambie su email${r.skipped ? ` · ${r.skipped} sin cuenta o fuera de tus cursos` : ''}. Lo ve en su inicio hasta que lo cambie.`
        : 'No se envió ningún pedido: los elegidos no tienen cuenta o no están en tus cursos.', !r.requested);
      setAsking(false);
      setReason('');
      resetSelection();
      refresh();
    },
    onError: (e: Error) => toast(e.message, true),
  });

  // Alumnos que ya estaban en Secundario antes de la creación automática: se crean por curso (devuelve las contraseñas).
  const createAccounts = useMutation({
    mutationFn: (divisionId: number) => apiSend<{ created: number; skipped: number; errors: Array<{ student: string; message: string }>; credentials: Credential[] }>('POST', '/school/students/accounts', { divisionId }),
    onSuccess: (r) => {
      toast(`${r.created} ${r.created === 1 ? 'cuenta creada' : 'cuentas creadas'}${r.skipped ? ` · ${r.skipped} ya tenían` : ''}${r.errors.length ? ` · ${r.errors.length} con error: ${r.errors.map((e) => `${e.student} (${e.message})`).join(', ')}` : ''}`, r.errors.length > 0);
      setCreds(r.credentials);
      refresh();
      qc.invalidateQueries({ queryKey: ['student'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const submitRequest = (e: FormEvent) => {
    e.preventDefault();
    if (picked.length) requestChange.mutate();
  };

  return (
    <div className="stack">
      <div className="alert alert-info small">
        <Mail size={18} style={{ flexShrink: 0 }} />
        <div className="grow">
          La cuenta del estudiante se crea sola cuando entra a Secundario: ingresa con su <b>DNI</b>. Sin email puede cambiar la contraseña, pero <b>si la olvida no puede recuperarla</b>.
          La familia puede cargar el email <b>solo si falta</b>; el estudiante lo puede cambiar cuando quiera desde su perfil. Si un email no parece real, pedile que lo cambie.
        </div>
      </div>
      <Chips value={status} onChange={(v) => (setStatus(v), setDivision(0), resetSelection())} items={[{ value: 'missing', label: 'Sin email' }, { value: 'present', label: 'Con email' }, { value: 'all', label: 'Todos' }]} />
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton count={4} h={72} />}
      {q.data && !rows.length && <Empty title={EMPTY[status].title} text={EMPTY[status].text} icon={<MailCheck size={36} strokeWidth={1.5} />} />}

      {rows.length > 0 && (
        <>
          {divisions.length > 1 && (
            <Chips value={division} onChange={(v) => (setDivision(v), resetSelection())} items={[{ value: 0, label: `Todos los cursos (${rows.length})` }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]} />
          )}
          {canSelect && (
            <div className="card card-pad stack" style={{ gap: 10 }}>
              <div className="row-between wrap">
                <label className="check small" style={{ minHeight: 32 }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={!selectable.length} /> {selected.size ? `${picked.length} seleccionados` : 'Seleccionar todos'}
                </label>
                <div className="row wrap" style={{ gap: 6 }}>
                  {canNotify && status !== 'present' && (
                    <button className="btn btn-sm" onClick={() => notify.mutate()} disabled={notify.isPending || (selected.size ? !pickedNoEmail.length : !visibleNoEmail.length)}><BellRing size={16} /> Avisar a las familias</button>
                  )}
                  {canRequest && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setAsking(true)} disabled={!picked.length} title={picked.length ? undefined : 'Elegí a quién pedírselo'}><MailQuestion size={16} /> Pedir cambio de email</button>
                  )}
                </div>
              </div>
              <div className="xs muted">
                {canNotify && status !== 'present' && <>{selected.size ? 'El aviso va solo a las familias de los seleccionados sin email.' : division ? 'Sin selección se avisa a todas las familias sin email de este curso.' : 'Sin selección se avisa a todas las familias de estudiantes sin email.'} No se repite a quien lo recibió hace menos de 7 días. </>}
                {canRequest && 'El pedido de cambio le llega al estudiante y queda en su inicio hasta que cambie el email.'}
              </div>
              {canNotify && status !== 'present' && (
                <label className="check xs" style={{ minHeight: 28 }}><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Reenviar igual a los avisados hace poco</label>
              )}
            </div>
          )}
          {groups.map((g) => {
            const withoutAccount = g.items.filter((r) => r.account === 'NONE').length;
            return (
              <section key={g.id} className="stack" style={{ gap: 8 }}>
                <div className="row-between wrap" style={{ gap: 8 }}>
                  <h3 className="h3">{g.name} <span className="muted small">· {g.items.length}</span></h3>
                  {withoutAccount > 0 && canCreate && (
                    <button className="btn btn-sm btn-ghost" disabled={createAccounts.isPending} onClick={() => createAccounts.mutate(g.id)}><KeySquare size={14} /> Crear cuentas del curso</button>
                  )}
                </div>
                {withoutAccount > 0 && (
                  <div className="xs muted">
                    {withoutAccount === 1 ? '1 estudiante no tiene cuenta' : `${withoutAccount} estudiantes no tienen cuenta`}: ya estaban en Secundario antes de que las cuentas se crearan solas (o les falta el DNI).
                    {canCreate ? ' Crealas acá: te mostramos las contraseñas para entregárselas.' : ' Pedile a la escuela que las cree.'}
                  </div>
                )}
                <div className="card list" style={{ overflow: 'hidden' }}>
                  {g.items.map((r) => {
                    const name = `${r.firstName} ${r.lastName}`;
                    return (
                      <div key={r.studentId} className="list-item" style={{ alignItems: 'flex-start' }}>
                        {canSelect && (
                          <input type="checkbox" style={{ width: 20, height: 20, marginTop: 2, accentColor: 'var(--primary)' }} aria-label={`Seleccionar a ${name}`}
                            checked={selected.has(r.studentId)} disabled={r.account === 'NONE'} onChange={() => toggle(r.studentId)} title={r.account === 'NONE' ? 'Sin cuenta: no hay a quién avisar todavía' : undefined} />
                        )}
                        <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
                          <div className="row wrap" style={{ gap: 6 }}>
                            <Link to={`/alumnos/${r.studentId}?tab=datos`} className="h3">{r.lastName}, {r.firstName}</Link>
                            {r.account === 'NONE' && <Badge>Sin cuenta</Badge>}
                            {r.account === 'NO_EMAIL' && <Badge tone="warn">Sin email</Badge>}
                            {r.account === 'HAS_EMAIL' && !r.email && <Badge tone="ok">Con email</Badge>}
                            {r.emailChangeRequestedAt && <Badge tone="info">Pedido de cambio · {fmtDate(r.emailChangeRequestedAt, { day: 'numeric', month: 'short' })}</Badge>}
                          </div>
                          {r.email && <div className="small row" style={{ gap: 4, wordBreak: 'break-all' }}><Mail size={14} style={{ flexShrink: 0 }} /> {r.email}</div>}
                          {r.emailChangeRequestedAt && r.emailChangeReason && <div className="xs muted">Motivo del pedido: {r.emailChangeReason}</div>}
                          <div className="small">
                            {r.guardians.length ? (
                              <>hijo/a de {r.guardians.map((x, i) => (
                                <span key={x.userId}>
                                  {i > 0 && (i === r.guardians.length - 1 ? ' y ' : ', ')}
                                  {x.name} <span className={x.hasEmail ? 'muted' : ''}>({[x.relationship?.toLowerCase(), x.hasEmail ? 'con email' : 'sin email'].filter(Boolean).join(', ')})</span>
                                </span>
                              ))}</>
                            ) : <span className="muted">Sin familiares vinculados</span>}
                          </div>
                          <div className="xs muted">
                            {r.login ? `Ingresa con ${r.login.split('@')[0]}` : ''}
                            {r.account === 'NO_EMAIL' && <>{r.login ? ' · ' : ''}{r.noEmailNoticeAt ? `Familia avisada ${timeAgo(r.noEmailNoticeAt)}` : 'Todavía no se avisó a la familia'}</>}
                          </div>
                          {(r.account === 'NONE' ? canCreate : canEdit) && (
                            <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(r)}><Mail size={14} /> {r.account === 'HAS_EMAIL' ? 'Cambiar email' : 'Cargar email'}</button>
                          )}
                        </div>
                        <Link to={`/alumnos/${r.studentId}?tab=datos`} className="icon-btn" aria-label={`Ver ficha de ${name}`}><ChevronRight size={18} /></Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
      <LoadEmailSheet studentId={editing?.studentId ?? null} name={editing ? editing.firstName : ''} noAccount={editing?.account === 'NONE'} replace={editing?.account === 'HAS_EMAIL'} onClose={() => setEditing(null)} />
      <Sheet open={asking} onClose={() => setAsking(false)} title="Pedir cambio de email">
        <form className="stack" onSubmit={submitRequest}>
          <p className="small">
            {picked.length === 1 ? <>Le vamos a pedir a <b>{picked[0].firstName} {picked[0].lastName}</b></> : <>Les vamos a pedir a <b>{picked.length} estudiantes</b></>} que cambie{picked.length === 1 ? '' : 'n'} el email de su cuenta.
            Le{picked.length === 1 ? '' : 's'} llega un aviso (y un mail si el actual es real) y queda en su inicio hasta que lo cambie{picked.length === 1 ? '' : 'n'}.
          </p>
          {picked.length > 1 && <div className="xs muted">{picked.slice(0, 8).map((r) => `${r.firstName} ${r.lastName}`).join(', ')}{picked.length > 8 ? ` y ${picked.length - 8} más` : ''}</div>}
          <Field label="Motivo (opcional)" hint="Si no escribís nada, le decimos que tiene que ser un email propio y real.">
            <textarea className="textarea" rows={3} maxLength={300} placeholder="Ej: el email cargado no parece real, cargá uno que uses" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <button className="btn btn-block" disabled={requestChange.isPending || !picked.length}>{requestChange.isPending ? 'Enviando…' : 'Pedir cambio de email'}</button>
        </form>
      </Sheet>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} title="Cuentas de estudiantes" />
    </div>
  );
};
