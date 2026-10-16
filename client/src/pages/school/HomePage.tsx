import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, MessageCircle, BellRing, ClipboardCheck, BookOpenCheck, ChevronRight, BellPlus, CheckCircle2 } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Card, ErrorBox, Skeleton, Badge, fmtDate, useToast } from '../../ui';
import { enablePush, pushState, isIOSNotInstalled, syncPush } from '../../lib/push';

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
  }>;
  mySubjects?: number;
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

          <div className="grid grid-2 grid-4">
            <Stat to="/comunicados" icon={<Megaphone size={18} />} value={d.unreadAnnouncements} label="Comunicados sin leer" />
            <Stat to="/mensajes" icon={<MessageCircle size={18} />} value={d.unreadThreads} label="Conversaciones nuevas" />
            {d.alerts && (
              <Stat to="/alertas" icon={<BellRing size={18} />} value={(d.alerts.CRITICAL ?? 0) + (d.alerts.WARNING ?? 0)} label="Alertas activas" tone={d.alerts.CRITICAL ? 'var(--danger)' : undefined} />
            )}
            {d.attendanceToday && (
              <Stat to="/asistencia" icon={<ClipboardCheck size={18} />} value={`${d.attendanceToday.taken}/${d.attendanceToday.divisions}`} label={`Asistencia tomada hoy · ${d.attendanceToday.absent} ausentes`} />
            )}
            {!!d.mySubjects && <Stat to="/materias" icon={<BookOpenCheck size={18} />} value={d.mySubjects} label="Materias a cargo" />}
          </div>

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

          {session?.isStaff && (
            <section className="stack">
              <h2 className="h2">Accesos rápidos</h2>
              <Card pad={false}>
                <div className="list">
                  {can('announcements.publish') && <Link to="/comunicados/nuevo" className="list-item"><Megaphone size={18} /><span className="grow">Nuevo comunicado</span><ChevronRight size={16} /></Link>}
                  {can('attendance.write') && <Link to="/asistencia" className="list-item"><ClipboardCheck size={18} /><span className="grow">Tomar asistencia</span><ChevronRight size={16} /></Link>}
                  {(session.teaching.length > 0 || can('grades.read')) && <Link to="/materias" className="list-item"><BookOpenCheck size={18} /><span className="grow">Cargar notas</span><ChevronRight size={16} /></Link>}
                  {can('alerts.read') && <Link to="/alertas" className="list-item"><BellRing size={18} /><span className="grow">Panel de alertas</span><ChevronRight size={16} /></Link>}
                </div>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
