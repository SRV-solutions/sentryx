import { FormEvent, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, MessageCircle, Phone, Mail, UserPlus, Unlink, ChevronRight, KeySquare } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { PersonSheet, ResetPasswordButton } from '../../school/PersonProfile';
import { CredentialsSheet, type Credential } from '../../school/CredentialsSheet';
import { useSchool } from '../../school/SchoolContext';
import { ReportCardView } from '../../school/ReportCardView';
import { Avatar, Badge, Card, ErrorBox, Skeleton, Tabs, fmtDate, Empty, Field, Sheet, useToast } from '../../ui';
import { ATTENDANCE_LABELS, type AttendanceStatus, type ReportCard } from '../../school/types';
import { Entity, Action } from '../../school/permissions';
import { StudentLifecycleCard } from '../../school/StudentLifecycle';
import { UpgradeCard } from '../../school/PlanGate';
import { PlanFeature, usePlan } from '../../school/plans';
import { StudentSubjects } from '../../school/StudentSubjects';
import { ConductPanel } from '../../school/ConductPanel';
import { StudentEmailCard, LoadEmailForm, emailNeedsAttention } from '../../school/StudentEmailCard';

type Tab = 'materias' | 'boletin' | 'asistencia' | 'convivencia' | 'juegos' | 'datos';

interface QuizResults { student?: string; results: Array<{ id: number; title?: string; subject: string | null; score: number; correctCount: number; questionCount: number; finishedAt: string }> }

/** Juegos de preguntas que respondió (personal; familias con plan Integral). */
const QuizResultsTab = ({ id, locked }: { id: number; locked: boolean }) => {
  const q = useQuery({ queryKey: ['student-quizzes', id], queryFn: () => apiGet<QuizResults>(`/school/quiz-results/student/${id}`), enabled: !locked });
  if (locked) return <UpgradeCard feature={PlanFeature.QUIZZES} title="Resultados de los juegos" />;
  if (q.isLoading) return <Skeleton count={2} h={60} />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data?.results.length) return <Empty title="Todavía no respondió juegos" text="Los juegos que asignan los docentes como tarea aparecen acá." />;
  return (
    <div className="card list" style={{ overflow: 'hidden' }}>
      {q.data.results.map((r) => (
        <div key={r.id} className="list-item">
          <div className="grow">
            <div className="h3">{r.title}</div>
            <div className="xs muted">{r.subject ? `${r.subject} · ` : ''}{fmtDate(r.finishedAt)}</div>
          </div>
          <Badge tone={r.correctCount / Math.max(1, r.questionCount) >= 0.6 ? 'ok' : 'warn'}>{r.correctCount}/{r.questionCount} · {r.score} pts</Badge>
        </div>
      ))}
    </div>
  );
};

interface StudentDetail {
  id: number;
  firstName: string;
  lastName: string;
  dni: string | null;
  birthDate: string | null;
  photoUrl: string | null;
  notes?: string | null;
  active?: boolean;
  leftAt?: string | null;
  leaveReason?: string | null;
  leaveNotes?: string | null;
  /**
   * Personal: datos completos de la cuenta. Familia: exists + hasEmail (+ el pedido de cambio). El propio estudiante: además su email.
   * emailChangeRequestedAt: la escuela le pidió que cambie el email; se limpia solo cuando lo cambia.
   */
  account?: {
    eligible?: boolean; exists: boolean; hasEmail?: boolean; email?: string | null; active?: boolean; userId?: number | null; login?: string | null; lastLogin?: string | null; mustChangePassword?: boolean | null;
    emailChangeRequestedAt?: string | null; emailChangeReason?: string | null;
  };
  Enrollments?: Array<{ Division?: { id: number; name: string; Level?: { name: string; type: string } } }>;
  /** Trayectoria: un registro por ciclo lectivo (el más nuevo primero). */
  history?: Array<{ academicYearId: number; year: number; status: string; division: { id: number; name: string; level: string | null } | null }>;
  Guardians?: Array<{ id: number; relationship: string; isPrimary: boolean; canPickUp: boolean; User: { id: number; firstName: string; lastName: string; avatar?: string | null; email?: string; phone?: string | null; dni?: string | null } }>;
}

interface AttendanceData {
  summary: { days: number; total: number; unjustified: number; percent: number; byStatus: Record<AttendanceStatus, number> };
  records: Array<{ id: number; date: string; status: AttendanceStatus; value: number; justified: boolean; note: string | null }>;
}

const AttendanceTab = ({ id }: { id: number }) => {
  const q = useQuery({ queryKey: ['student-attendance', id], queryFn: () => apiGet<AttendanceData>(`/school/attendance/student/${id}`) });
  if (q.isLoading) return <Skeleton count={3} h={60} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!.summary;
  return (
    <div className="stack">
      <div className="grid grid-2 grid-4">
        <Card><div className="stat" style={{ padding: 0 }}><div className="value" style={{ color: s.percent < 85 ? 'var(--danger)' : undefined }}>{s.percent}%</div><div className="label">Asistencia</div></div></Card>
        <Card><div className="stat" style={{ padding: 0 }}><div className="value">{s.total}</div><div className="label">Faltas computadas</div></div></Card>
        <Card><div className="stat" style={{ padding: 0 }}><div className="value">{s.unjustified}</div><div className="label">Sin justificar</div></div></Card>
        <Card><div className="stat" style={{ padding: 0 }}><div className="value">{s.byStatus.TARDE ?? 0}</div><div className="label">Llegadas tarde</div></div></Card>
      </div>
      {q.data!.records.length ? (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {q.data!.records.map((r) => (
            <div key={r.id} className="list-item">
              <div className="grow">
                <div className="h3">{fmtDate(r.date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                {r.note && <div className="xs muted">{r.note}</div>}
              </div>
              <Badge tone={r.status === 'AUSENTE' ? 'danger' : 'warn'}>{ATTENDANCE_LABELS[r.status]}</Badge>
              {r.justified && <Badge tone="ok">Justificada</Badge>}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Sin inasistencias registradas 🎉" />
      )}
    </div>
  );
};

/** Cuenta propia del estudiante (solo Secundario): crear, desactivar/reactivar y blanquear. */
const StudentAccountCard = ({ studentId, name, account }: { studentId: number; name: string; account: NonNullable<StudentDetail['account']> }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['student', studentId] });
  const create = useMutation({
    // El email es opcional: sin él entra con el DNI, pero no podría recuperar la contraseña.
    mutationFn: () => apiSend<{ credentials: Credential[] }>('POST', `/school/students/${studentId}/account`, newEmail.trim() ? { email: newEmail.trim().toLowerCase() } : {}),
    onSuccess: (r) => (refresh(), r.credentials.length ? setCreds(r.credentials) : toast('Cuenta reactivada')),
    onError: (e: Error) => toast(e.message, true),
  });
  const toggle = useMutation({
    mutationFn: (active: boolean) => apiSend('PATCH', `/school/students/${studentId}/account`, { active }),
    onSuccess: (_r, active) => (refresh(), toast(active ? 'Cuenta reactivada' : 'Cuenta desactivada (se conserva todo su historial)')),
    onError: (e: Error) => toast(e.message, true),
  });
  if (!account.eligible) return null;
  return (
    <Card>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row-between">
          <h3 className="h3 row"><KeySquare size={18} /> Cuenta del estudiante</h3>
          <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
            {account.exists && account.hasEmail === false && <Badge tone="warn">Sin email</Badge>}
            {account.exists ? <Badge tone={account.active ? 'ok' : 'danger'}>{account.active ? 'Activa' : 'Desactivada'}</Badge> : <Badge>Sin cuenta</Badge>}
          </div>
        </div>
        {account.exists ? (
          <>
            <div className="small">
              Usuario: <b>{account.login?.endsWith('@sin-email.local') ? account.login.split('@')[0] : account.login}</b> · {account.lastLogin ? `último ingreso ${fmtDate(account.lastLogin)}` : 'nunca ingresó'}
              {account.hasEmail && account.email && <> · {account.email}</>}
            </div>
            {account.emailChangeRequestedAt && (
              <div className="xs"><Badge tone="info">Pedido de cambio enviado el {fmtDate(account.emailChangeRequestedAt, { day: 'numeric', month: 'long' })}</Badge>{account.emailChangeReason && <span className="muted"> · {account.emailChangeReason}</span>}</div>
            )}
            {loadingEmail
              ? <LoadEmailForm studentId={studentId} autoFocus replace={!!account.hasEmail} onDone={() => setLoadingEmail(false)} hint="Un email propio del estudiante (no el de la familia si ya lo usa en su cuenta)." />
              : account.hasEmail === false && <p className="xs muted">Sin email: entra con su DNI y puede cambiar la contraseña, pero si la olvida no puede recuperarla.</p>}
            <div className="row wrap">
              {!loadingEmail && <button className={`btn btn-sm${account.hasEmail ? ' btn-ghost' : ''}`} onClick={() => setLoadingEmail(true)}><Mail size={14} /> {account.hasEmail ? 'Cambiar email' : 'Cargar email'}</button>}
              {account.active && account.userId && <ResetPasswordButton userId={account.userId} name={name} />}
              <button className="btn btn-sm btn-ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(!account.active)}>{account.active ? 'Desactivar cuenta' : 'Reactivar cuenta'}</button>
            </div>
          </>
        ) : (
          <>
            <p className="small muted">Con cuenta propia puede escribirles a sus docentes y participar del canal de su curso. Ingresa con su DNI.</p>
            <Field label="Email del estudiante (opcional)" hint="Con email puede recuperar su contraseña si la olvida. Tiene que ser propio, no el de la familia.">
              <input className="input" type="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={120} placeholder="email@ejemplo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </Field>
            <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => create.mutate()} disabled={create.isPending}><KeySquare size={16} /> Crear cuenta</button>
          </>
        )}
      </div>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} />
    </Card>
  );
};

/** Vincula otro familiar a un alumno existente (o reutiliza su cuenta si ya existe por DNI/email). */
const AddGuardianSheet = ({ studentId, studentName, onClose }: { studentId: number; studentName: string; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ firstName: '', lastName: '', dni: '', email: '', phone: '', relationship: 'Padre', canPickUp: true, sendEmail: true });
  const [error, setError] = useState('');
  const [creds, setCreds] = useState<Credential[]>([]);
  const add = useMutation({
    mutationFn: () => apiSend<{ name: string; login: string; tempPassword: string | null; email: string | null; existing: boolean }>('POST', `/school/students/${studentId}/guardians`, { ...f, sendEmail: f.sendEmail && !!f.email.trim() }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['student', studentId] });
      qc.invalidateQueries({ queryKey: ['people'] });
      if (r.tempPassword) setCreds([{ name: r.name, login: r.login, tempPassword: r.tempPassword, email: r.email }]);
      else {
        toast(r.existing ? `${r.name} ya tenía cuenta: quedó vinculado/a con su contraseña actual.` : 'Familiar agregado');
        onClose();
      }
    },
    onError: (e: Error) => setError(e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!f.dni.trim() && !f.email.trim()) return setError('Cargá el DNI o el email: es lo que usa para ingresar.');
    add.mutate();
  };
  return (
    <>
      <Sheet open={!creds.length} onClose={onClose} title={`Agregar familiar de ${studentName}`}>
        <form className="stack" onSubmit={submit}>
          <div className="grid grid-2">
            <Field label="Nombre"><input className="input" required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
            <Field label="Apellido"><input className="input" required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
            <Field label="DNI"><input className="input" inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} /></Field>
            <Field label="Vínculo">
              <select className="select" value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })}>
                {['Madre', 'Padre', 'Tutor/a', 'Abuelo/a', 'Otro'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          </div>
          <label className="row small"><input type="checkbox" checked={f.canPickUp} onChange={(e) => setF({ ...f, canPickUp: e.target.checked })} /> Autorizado/a a retirar</label>
          <label className="row small" style={{ gap: 8, opacity: f.email ? 1 : 0.5 }}>
            <input type="checkbox" disabled={!f.email} checked={!!f.email && f.sendEmail} onChange={(e) => setF({ ...f, sendEmail: e.target.checked })} />
            <span>Enviarle por mail los datos de acceso<span className="xs muted" style={{ display: 'block' }}>Le llega un botón para entrar directo y elegir su contraseña (sirve una vez, 7 días).</span></span>
          </label>
          <p className="xs muted">Si ya tiene cuenta (por ejemplo, por un hermano), se vincula a la misma.</p>
          {error && <div className="alert alert-danger small">{error}</div>}
          <button className="btn btn-block" disabled={add.isPending}>{add.isPending ? 'Guardando…' : 'Agregar familiar'}</button>
        </form>
      </Sheet>
      <CredentialsSheet items={creds} onClose={() => (setCreds([]), onClose())} />
    </>
  );
};

export default function StudentPage() {
  const id = Number(useParams().id);
  const { session, can } = useSchool();
  // La familia y el propio estudiante ven lo mismo (lo publicado).
  const isGuardian = !!session?.childIds.includes(id) || session?.self?.studentId === id;
  const staffView = !isGuardian && !!session?.isStaff;
  const manage = staffView && can(Entity.USERS, Action.UPDATE);
  const qc = useQueryClient();
  const toast = useToast();
  const [profileId, setProfileId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [unlinking, setUnlinking] = useState<{ id: number; name: string } | null>(null);
  const unlink = useMutation({
    mutationFn: (linkId: number) => apiSend('DELETE', `/school/guardians/${linkId}`),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['student', id] }), setUnlinking(null), toast('Familiar desvinculado')),
    onError: (e: Error) => toast(e.message, true),
  });
  const isSelf = !!session?.self && session.self.studentId === id;
  // Convivencia: la familia y el estudiante siempre (la API filtra lo interno); el personal, con permiso.
  const showConduct = isGuardian || can(Entity.CONDUCT, Action.READ) || can(Entity.CONDUCT, Action.CREATE);
  // La pestaña vive en la URL (?tab=…): las notificaciones y el inicio linkean directo (ej: ?tab=convivencia).
  const [params, setParams] = useSearchParams();
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'materias', label: 'Materias' }, { value: 'boletin', label: 'Boletín' }, { value: 'asistencia', label: 'Asistencia' },
    ...(showConduct ? [{ value: 'convivencia' as Tab, label: 'Convivencia' }] : []), { value: 'juegos', label: 'Juegos' }, { value: 'datos', label: 'Datos' },
  ];
  // Familia / estudiante arrancan en sus materias; el personal, en el boletín (como siempre).
  const defaultTab: Tab = isGuardian ? 'materias' : 'boletin';
  const tab: Tab = tabs.find((t) => t.value === params.get('tab'))?.value ?? defaultTab;
  const setTab = (t: Tab) => setParams(t === defaultTab ? {} : { tab: t }, { replace: true });
  const { hasFeature } = usePlan();

  const student = useQuery({ queryKey: ['student', id], queryFn: () => apiGet<StudentDetail>(`/school/students/${id}`) });
  // Boletín por ciclo: por defecto el actual; el alumno conserva los de años anteriores.
  const [yearId, setYearId] = useState<number | null>(null);
  const report = useQuery({
    queryKey: ['report-card', id, yearId],
    queryFn: () => apiGet<ReportCard>(`/school/grades/report-card/${id}${yearId ? `?yearId=${yearId}` : ''}`),
    enabled: tab === 'boletin',
    retry: false,
  });

  const s = student.data;
  const division = s?.Enrollments?.[0]?.Division;
  const years = s?.history ?? [];
  const currentYearId = session?.academicYearId ?? null;

  return (
    <div className="stack-lg">
      <Link to={isGuardian ? (session!.childIds.length > 1 ? '/familia' : '/inicio') : '/alumnos'} className="row small muted no-print">
        <ArrowLeft size={16} /> {isGuardian ? (session!.childIds.length > 1 ? 'Mis hijos' : 'Inicio') : 'Alumnos'}
      </Link>
      {student.error && <ErrorBox error={student.error} />}
      {!s && !student.error && <Skeleton count={1} h={90} />}
      {s && (
        <div className="row">
          <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photoUrl} size="lg" />
          <div className="grow">
            <h1 className="h1">{isSelf ? 'Mi perfil' : `${s.firstName} ${s.lastName}`} {s.active === false && <Badge tone="danger">Dado/a de baja</Badge>}</h1>
            <div className="small muted">{isSelf ? `${s.firstName} ${s.lastName} · ` : ''}{division ? `${division.name} · ${division.Level?.name}` : 'Sin inscripción en el ciclo actual'}</div>
          </div>
          <Link to={isSelf ? '/comunicados/nuevo' : `/comunicados/nuevo?alumno=${id}`} className="btn btn-sm btn-ghost no-print"><MessageCircle size={16} /> <span className="hide-mobile">Escribir</span></Link>
        </div>
      )}

      {s && manage && <div className="no-print"><StudentLifecycleCard student={s} divisionId={division?.id} /></div>}
      {/* Sin email (o la escuela le pidió al estudiante cambiarlo): arriba de todo, para cargarlo acá mismo. Si no, va en "Datos". */}
      {s && isGuardian && s.account && emailNeedsAttention(s.account, isSelf) && <StudentEmailCard studentId={id} firstName={s.firstName} self={isSelf} account={s.account} />}

      <div className="no-print">
        <Tabs value={tab} onChange={setTab} items={tabs} />
      </div>

      {tab === 'materias' && <StudentSubjects studentId={id} canWrite={isGuardian} self={isSelf} />}
      {tab === 'convivencia' && s && <ConductPanel studentId={id} studentName={s.firstName} staffView={!isGuardian} />}
      {tab === 'boletin' && (
        <>
          {years.length > 1 && (
            <div className="chips no-print" style={{ flexWrap: 'wrap' }}>
              {years.map((h) => {
                const active = (yearId ?? currentYearId) === h.academicYearId;
                return (
                  <button type="button" key={h.academicYearId} className={`chip ${active ? 'active' : ''}`} onClick={() => setYearId(h.academicYearId === currentYearId ? null : h.academicYearId)}>
                    {h.year}{h.division ? ` · ${h.division.name}` : ''}
                  </button>
                );
              })}
            </div>
          )}
          {report.isLoading && <Skeleton count={1} h={240} />}
          {report.error && <ErrorBox error={report.error} />}
          {report.data && (
            <>
              <div className="row-between no-print">
                <span className="small muted">{isGuardian || !can(Entity.GRADES, Action.READ) ? 'Se muestran los períodos publicados por la escuela.' : 'Vista del personal: incluye períodos sin publicar.'}</span>
                <Link to={`/boletin/${id}${yearId ? `?ciclo=${yearId}` : ''}`} className="btn btn-sm btn-ghost"><Printer size={16} /> Imprimir</Link>
              </div>
              <ReportCardView data={report.data} />
            </>
          )}
        </>
      )}
      {tab === 'asistencia' && <AttendanceTab id={id} />}
      {tab === 'juegos' && <QuizResultsTab id={id} locked={isGuardian && !session?.self && !hasFeature(PlanFeature.QUIZZES)} />}
      {tab === 'datos' && s && (
        <div className="stack">
          <Card>
            <div className="stack" style={{ gap: 6 }}>
              {s.dni && <div className="small"><b>DNI:</b> {s.dni}</div>}
              {s.birthDate && <div className="small"><b>Fecha de nacimiento:</b> {fmtDate(s.birthDate, { day: 'numeric', month: 'long', year: 'numeric' })}</div>}
              {!isGuardian && s.notes && <div className="alert alert-warn small" style={{ marginTop: 8 }}><b>Notas internas:</b> {s.notes}</div>}
            </div>
          </Card>
          {isGuardian && s.account?.exists && !emailNeedsAttention(s.account, isSelf) && <StudentEmailCard studentId={id} firstName={s.firstName} self={isSelf} account={s.account} />}
          {manage && s.account && <StudentAccountCard studentId={id} name={`${s.firstName} ${s.lastName}`} account={s.account} />}
          {years.length > 0 && (
            <>
              <h2 className="h2">Trayectoria</h2>
              <div className="card list" style={{ overflow: 'hidden' }}>
                {years.map((h) => (
                  <div key={h.academicYearId} className="list-item">
                    <div className="grow">
                      <div className="h3">{h.year} · {h.division ? `${h.division.name}${h.division.level ? ` · ${h.division.level}` : ''}` : 'Sin curso'}</div>
                    </div>
                    <Badge tone={h.status === 'ACTIVE' ? 'ok' : h.status === 'COMPLETED' ? 'info' : undefined}>{h.status === 'ACTIVE' ? 'En curso' : h.status === 'COMPLETED' ? 'Cursado' : h.status === 'WITHDRAWN' ? 'Baja' : h.status}</Badge>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => (setYearId(h.academicYearId === currentYearId ? null : h.academicYearId), setTab('boletin'))}>Ver boletín</button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="row-between">
            <h2 className="h2">Familia</h2>
            {manage && <button className="btn btn-sm" onClick={() => setAdding(true)}><UserPlus size={16} /> Agregar familiar</button>}
          </div>
          {!s.Guardians?.length && <Empty title="Sin familiares vinculados" text={manage ? 'Agregá a la madre, el padre o tutor para que reciban comunicados.' : undefined} />}
          <div className="card list" style={{ overflow: 'hidden' }}>
            {s.Guardians?.map((g) => (
              <div key={g.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Avatar name={`${g.User.firstName} ${g.User.lastName}`} src={g.User.avatar} size="sm" />
                <div className="grow">
                  {staffView ? (
                    <button className="h3 row" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', gap: 4 }} onClick={() => setProfileId(g.User.id)}>
                      {g.User.firstName} {g.User.lastName} <ChevronRight size={14} className="muted" />
                    </button>
                  ) : (
                    <div className="h3">{g.User.firstName} {g.User.lastName}</div>
                  )}
                  <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                    <Badge>{g.relationship}</Badge>
                    {g.isPrimary && <Badge tone="info">Principal</Badge>}
                    {g.canPickUp && <Badge tone="ok">Autorizado a retirar</Badge>}
                  </div>
                  {!isGuardian && (
                    <div className="row wrap small" style={{ marginTop: 6, gap: 12 }}>
                      {g.User.phone && <a href={`tel:${g.User.phone}`} className="row" style={{ gap: 4 }}><Phone size={14} /> {g.User.phone}</a>}
                      {g.User.email && !g.User.email.endsWith('@sin-email.local') && <a href={`mailto:${g.User.email}`} className="row" style={{ gap: 4 }}><Mail size={14} /> {g.User.email}</a>}
                    </div>
                  )}
                </div>
                {manage && (
                  <button className="icon-btn" aria-label="Desvincular" title="Desvincular" onClick={() => setUnlinking({ id: g.id, name: `${g.User.firstName} ${g.User.lastName}` })}><Unlink size={16} /></button>
                )}
              </div>
            ))}
          </div>
          <PersonSheet userId={profileId} onClose={() => setProfileId(null)} />
          {adding && <AddGuardianSheet studentId={id} studentName={s.firstName} onClose={() => setAdding(false)} />}
          <Sheet open={!!unlinking} onClose={() => setUnlinking(null)} title="Desvincular familiar">
            <div className="stack">
              <p className="small">
                <b>{unlinking?.name}</b> dejará de ver a {s.firstName} y de recibir sus comunicados. Su cuenta no se borra (si tiene otros hijos en la escuela, los sigue viendo).
              </p>
              <div className="row">
                <button className="btn btn-ghost grow" onClick={() => setUnlinking(null)}>Cancelar</button>
                <button className="btn btn-danger grow" disabled={unlink.isPending} onClick={() => unlinking && unlink.mutate(unlinking.id)}>Desvincular</button>
              </div>
            </div>
          </Sheet>
        </div>
      )}
    </div>
  );
}
