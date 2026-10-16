import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, MessageCircle, Phone, Mail } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { ReportCardView } from '../../school/ReportCardView';
import { Avatar, Badge, Card, ErrorBox, Skeleton, Tabs, fmtDate, Empty } from '../../ui';
import { ATTENDANCE_LABELS, type AttendanceStatus, type ReportCard } from '../../school/types';

interface StudentDetail {
  id: number;
  firstName: string;
  lastName: string;
  dni: string | null;
  birthDate: string | null;
  photoUrl: string | null;
  notes?: string | null;
  Enrollments?: Array<{ Division?: { id: number; name: string; Level?: { name: string; type: string } } }>;
  Guardians?: Array<{ id: number; relationship: string; isPrimary: boolean; canPickUp: boolean; User: { id: number; firstName: string; lastName: string; email?: string; phone?: string | null; dni?: string | null } }>;
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

export default function StudentPage() {
  const id = Number(useParams().id);
  const { session } = useSchool();
  const isGuardian = !!session?.childIds.includes(id);
  const [tab, setTab] = useState<'grades' | 'attendance' | 'info'>('grades');

  const student = useQuery({ queryKey: ['student', id], queryFn: () => apiGet<StudentDetail>(`/school/students/${id}`) });
  const report = useQuery({ queryKey: ['report-card', id], queryFn: () => apiGet<ReportCard>(`/school/grades/report-card/${id}`), enabled: tab === 'grades' });

  const s = student.data;
  const division = s?.Enrollments?.[0]?.Division;

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
            <h1 className="h1">{s.firstName} {s.lastName}</h1>
            <div className="small muted">{division ? `${division.name} · ${division.Level?.name}` : 'Sin inscripción en el ciclo actual'}</div>
          </div>
          <Link to={`/mensajes/nuevo?alumno=${id}`} className="btn btn-sm btn-ghost no-print"><MessageCircle size={16} /> <span className="hide-mobile">Escribir</span></Link>
        </div>
      )}

      <div className="no-print">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'grades', label: 'Boletín' }, { value: 'attendance', label: 'Asistencia' }, { value: 'info', label: 'Datos' }]} />
      </div>

      {tab === 'grades' && (
        <>
          {report.isLoading && <Skeleton count={1} h={240} />}
          {report.error && <ErrorBox error={report.error} />}
          {report.data && (
            <>
              <div className="row-between no-print">
                <span className="small muted">{isGuardian ? 'Se muestran los períodos publicados por la escuela.' : 'Vista del personal: incluye períodos sin publicar.'}</span>
                <Link to={`/boletin/${id}`} className="btn btn-sm btn-ghost"><Printer size={16} /> Imprimir</Link>
              </div>
              <ReportCardView data={report.data} />
            </>
          )}
        </>
      )}
      {tab === 'attendance' && <AttendanceTab id={id} />}
      {tab === 'info' && s && (
        <div className="stack">
          <Card>
            <div className="stack" style={{ gap: 6 }}>
              {s.dni && <div className="small"><b>DNI:</b> {s.dni}</div>}
              {s.birthDate && <div className="small"><b>Fecha de nacimiento:</b> {fmtDate(s.birthDate, { day: 'numeric', month: 'long', year: 'numeric' })}</div>}
              {!isGuardian && s.notes && <div className="alert alert-warn small" style={{ marginTop: 8 }}><b>Notas internas:</b> {s.notes}</div>}
            </div>
          </Card>
          <h2 className="h2">Familia</h2>
          <div className="card list" style={{ overflow: 'hidden' }}>
            {s.Guardians?.map((g) => (
              <div key={g.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Avatar name={`${g.User.firstName} ${g.User.lastName}`} size="sm" />
                <div className="grow">
                  <div className="h3">{g.User.firstName} {g.User.lastName}</div>
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
