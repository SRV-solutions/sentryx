import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, MessageCircle, BellRing, ClipboardCheck, BookOpenCheck, ChevronRight, BellPlus, CheckCircle2, Hash, FileText, School, CalendarClock, MailWarning } from 'lucide-react';
import type { AgendaItem } from './ClassroomPage';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Card, ErrorBox, Skeleton, Badge, fmtDate, useToast } from '../../ui';
import { enablePush, pushState, isIOSNotInstalled, syncPush } from '../../lib/push';
import { Entity, Action } from '../../school/permissions';

interface Dashboard {
  unreadAnnouncements: number;
  pendingAck: number;
  unreadThreads: number;
  children?: Array<{
    id: number;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    division?: { id: number; name: string; Level?: { name: string } };
    attendance: { days: number; absences: number; percent: number; absentToday: boolean };
    lastReportCardAt: string | null;
    /** Tiene cuenta propia (Secundario) pero sin email: no podría recuperar la contraseña. */
    accountWithoutEmail?: boolean;
  }>;
  me?: {
    id: number;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    division?: { id: number; name: string; Level?: { name: string } };
    attendance: { days: number; absences: number; percent: number; absentToday: boolean };
    lastReportCardAt: string | null;
    accountWithoutEmail?: boolean;
    /** La escuela le pidió que cambie el email (ej: cargaron cualquier cosa); se borra cuando lo cambia. */
    emailChangeRequested?: boolean;
    emailChangeReason?: string | null;
  } | null;
  mySubjects?: number;
  /** Estudiantes de Secundario (en el alcance) sin email o sin cuenta; solo con alerts:read. */
  studentsWithoutEmail?: number;
  alerts?: Partial<Record<'CRITICAL' | 'WARNING' | 'INFO', number>>;
  attendanceToday?: { divisions: number; taken: number; absent: number };
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
};

const PushBanner = () => {
  const toast = useToast();
  const [state, setState] = useState(pushState());
  useEffect(() => {
    syncPush();
  }, []);
  if (state === 'granted' || state === 'unsupported' || state === 'denied') {
    if (state === 'unsupported' && isIOSNotInstalled())
      return (
        <div className="alert alert-info">
          <BellPlus size={20} />
          <div className="small">
            <b>Recibí los avisos al instante:</b> tocá <b>Compartir</b> → <b>Agregar a pantalla de inicio</b> y abrí Sentryx desde ahí.
          </div>
        </div>
      );
    return null;
  }
  return (
    <div className="alert alert-info">
      <BellPlus size={20} />
      <div className="grow small">
        <b>Activá las notificaciones</b> para enterarte de comunicados y mensajes en el momento.
      </div>
      <button
        className="btn btn-sm"
        onClick={async () => {
          const ok = await enablePush().catch(() => false);
          setState(pushState());
          toast(ok ? 'Notificaciones activadas ✅' : 'No se pudieron activar las notificaciones', !ok);
        }}
      >
        Activar
      </button>
    </div>
  );
};

const Stat = ({ to, icon, value, label, tone }: { to: string; icon: React.ReactNode; value: number | string; label: string; tone?: string }) => (
  <Link to={to} className="card card-link stat">
    <div className="row-between">
      <div className="value" style={tone ? { color: tone } : undefined}>{value}</div>
      <span className="muted">{icon}</span>
    </div>
    <div className="label">{label}</div>
  </Link>
);

export default function HomePage() {
  const { session, can } = useSchool();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => apiGet<Dashboard>('/school/dashboard'), refetchInterval: 60_000 });
  const d = q.data;
  // Evaluaciones, TP y tareas con fecha en los próximos 14 días (familias: de sus hijos; docentes: de sus cursos).
  const agenda = useQuery({ queryKey: ['agenda-home'], queryFn: () => apiGet<AgendaItem[]>('/school/classrooms/agenda?days=14'), enabled: !!session, staleTime: 60_000 });

  return (
    <div className="stack-lg">
      <div>
        <h1 className="h1">
          {greeting()}, {user?.userData.firstName}
          <span className="accent">.</span>
        </h1>
        <p className="muted small" style={{ marginTop: 4 }}>
          {session?.roleLabels.join(' · ')} · {fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <PushBanner />
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {!d && !q.error && <Skeleton count={3} h={84} />}

      {d && (
        <>
          {d.pendingAck > 0 && (
            <Link to="/comunicados" className="alert alert-warn card-link">
              <Megaphone size={20} />
              <div className="grow">
                <b>{d.pendingAck === 1 ? 'Tenés 1 comunicado' : `Tenés ${d.pendingAck} comunicados`} para confirmar</b>
                <div className="small">La escuela necesita que confirmes que lo leíste.</div>
              </div>
              <ChevronRight size={18} />
            </Link>
          )}

          {/* Cuentas sin email: sin email no hay recupero de contraseña (solo cambio). */}
          {!!d.studentsWithoutEmail && (
            <Link to="/alertas?tab=emails" className="alert alert-warn card-link">
              <MailWarning size={20} />
              <div className="grow">
                <b>{d.studentsWithoutEmail === 1 ? '1 estudiante no tiene' : `${d.studentsWithoutEmail} estudiantes no tienen`} email en su cuenta</b>
                <div className="small">Si se olvidan la contraseña no van a poder recuperarla. Avisales a las familias.</div>
              </div>
              <ChevronRight size={18} />
            </Link>
          )}
          {d.children?.filter((c) => c.accountWithoutEmail).map((c) => (
            <Link key={c.id} to={`/familia/${c.id}?tab=datos`} className="alert alert-warn card-link">
              <MailWarning size={20} />
              <div className="grow">
                <b>{c.firstName} no tiene email en su cuenta</b>
                <div className="small">Cargalo para que pueda recuperar su contraseña si la olvida.</div>
              </div>
              <ChevronRight size={18} />
            </Link>
          ))}
          {d.me?.accountWithoutEmail && !d.me.emailChangeRequested && (
            <Link to={`/familia/${d.me.id}?tab=datos`} className="alert alert-warn card-link">
              <MailWarning size={20} />
              <div className="grow">
                <b>Tu cuenta no tiene email</b>
                <div className="small">Cargalo para poder recuperar tu contraseña si la olvidás.</div>
              </div>
              <ChevronRight size={18} />
            </Link>
          )}
          {d.me?.emailChangeRequested && (
            <Link to={`/familia/${session?.self?.studentId ?? d.me.id}?tab=datos`} className="alert alert-warn card-link">
              <MailWarning size={20} />
              <div className="grow">
                <b>La escuela te pidió que actualices tu email</b>
                <div className="small">{d.me.emailChangeReason ? `Motivo: ${d.me.emailChangeReason}` : 'Tiene que ser un email tuyo y real. Cambialo desde Mi perfil → Datos.'}</div>
              </div>
              <ChevronRight size={18} />
            </Link>
          )}

          <div className="grid grid-2 grid-4">
            <Stat to="/comunicados" icon={<Megaphone size={18} />} value={d.unreadAnnouncements} label="Comunicados sin leer" />
            <Stat to="/comunicados?tab=conversaciones" icon={<MessageCircle size={18} />} value={d.unreadThreads} label="Conversaciones nuevas" />
            {d.alerts && (
              <Stat to="/alertas" icon={<BellRing size={18} />} value={(d.alerts.CRITICAL ?? 0) + (d.alerts.WARNING ?? 0)} label="Alertas activas" tone={d.alerts.CRITICAL ? 'var(--danger)' : undefined} />
            )}
            {d.attendanceToday && (
              <Stat to="/asistencia" icon={<ClipboardCheck size={18} />} value={`${d.attendanceToday.taken}/${d.attendanceToday.divisions}`} label={`Asistencia tomada hoy · ${d.attendanceToday.absent} ausentes`} />
            )}
            {!!d.mySubjects && <Stat to="/materias" icon={<BookOpenCheck size={18} />} value={d.mySubjects} label="Materias a cargo" />}
          </div>

          {!!agenda.data?.length && (
            <section className="stack">
              <h2 className="h2">Próximas evaluaciones y entregas</h2>
              <div className="card list" style={{ overflow: 'hidden' }}>
                {agenda.data.slice(0, 8).map((a) => (
                  <Link key={a.id} to={`/aulas/${a.division.id}`} className="list-item" style={{ color: 'inherit' }}>
                    <CalendarClock size={18} style={{ color: a.kind === 'EVALUACION' ? 'var(--danger)' : 'var(--accent)' }} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="h3 truncate">{a.title}</div>
                      <div className="xs muted">{a.kindLabel} · {a.division.name}{a.subject ? ` · ${a.subject.name}` : ''}</div>
                    </div>
                    <Badge tone={a.kind === 'EVALUACION' ? 'danger' : 'warn'}>{fmtDate(a.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })}</Badge>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {d.children && d.children.length > 0 && (
            <section className="stack">
              <h2 className="h2">{d.children.length > 1 ? 'Tus hijos' : 'Tu hijo/a'}</h2>
              <div className="grid grid-auto">
                {d.children.map((c) => (
                  <Link key={c.id} to={`/familia/${c.id}`} className="card card-link card-pad stack">
                    <div className="row">
                      <Avatar name={`${c.firstName} ${c.lastName}`} src={c.photoUrl} size="lg" />
                      <div className="grow">
                        <div className="h3">{c.firstName} {c.lastName}</div>
                        <div className="small muted">{c.division ? `${c.division.name} · ${c.division.Level?.name}` : 'Sin inscripción vigente'}</div>
                      </div>
                      <ChevronRight size={18} className="muted" />
                    </div>
                    <div className="row wrap">
                      {c.attendance.absentToday ? <Badge tone="danger">Ausente hoy</Badge> : c.attendance.days > 0 && <Badge tone="ok"><CheckCircle2 size={12} /> Presente hoy</Badge>}
                      <Badge tone={c.attendance.percent < 85 ? 'warn' : undefined}>Asistencia {c.attendance.percent}%</Badge>
                      <Badge>{c.attendance.absences} faltas</Badge>
                      {c.lastReportCardAt && <Badge tone="info">Boletín {fmtDate(c.lastReportCardAt, { day: 'numeric', month: 'short' })}</Badge>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {d.me && (
            <section className="stack">
              <h2 className="h2">Mi curso</h2>
              <div className="card card-pad stack">
                <div className="row">
                  <div className="grow">
                    <div className="h3">{d.me.division ? `${d.me.division.name} · ${d.me.division.Level?.name}` : 'Sin inscripción vigente'}</div>
                    <div className="row wrap" style={{ marginTop: 6 }}>
                      <Badge tone={d.me.attendance.percent < 85 ? 'warn' : undefined}>Asistencia {d.me.attendance.percent}%</Badge>
                      <Badge>{d.me.attendance.absences} faltas</Badge>
                      {d.me.lastReportCardAt && <Badge tone="info">Boletín {fmtDate(d.me.lastReportCardAt, { day: 'numeric', month: 'short' })}</Badge>}
                    </div>
                  </div>
                </div>
              </div>
              <Card pad={false}>
                <div className="list">
                  <Link to="/canales" className="list-item"><Hash size={18} /><span className="grow">Canales del curso</span><ChevronRight size={16} /></Link>
                  <Link to="/comunicados/nuevo" className="list-item"><MessageCircle size={18} /><span className="grow">Escribirle a un docente</span><ChevronRight size={16} /></Link>
                  {d.me.division && <Link to={`/aulas/${d.me.division.id}`} className="list-item"><School size={18} /><span className="grow">Materiales y tareas</span><ChevronRight size={16} /></Link>}
                  <Link to={`/familia/${session?.self?.studentId ?? d.me.id}`} className="list-item"><FileText size={18} /><span className="grow">Mi perfil<span className="xs muted" style={{ display: 'block' }}>Materias y notas, asistencia y convivencia</span></span><ChevronRight size={16} /></Link>
                </div>
              </Card>
            </section>
          )}

          {session?.isStaff && (
            <section className="stack">
              <h2 className="h2">Accesos rápidos</h2>
              <Card pad={false}>
                <div className="list">
                  {can(Entity.ANNOUNCEMENTS, Action.CREATE) && <Link to="/comunicados/nuevo" className="list-item"><Megaphone size={18} /><span className="grow">Nuevo comunicado</span><ChevronRight size={16} /></Link>}
                  {can(Entity.ATTENDANCE, Action.UPDATE) && <Link to="/asistencia" className="list-item"><ClipboardCheck size={18} /><span className="grow">Tomar asistencia</span><ChevronRight size={16} /></Link>}
                  {(session.teaching.length > 0 || can(Entity.GRADES, Action.READ)) && <Link to="/materias" className="list-item"><BookOpenCheck size={18} /><span className="grow">Cargar notas</span><ChevronRight size={16} /></Link>}
                  {can(Entity.ALERTS, Action.READ) && <Link to="/alertas" className="list-item"><BellRing size={18} /><span className="grow">Panel de alertas</span><ChevronRight size={16} /></Link>}
                </div>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
