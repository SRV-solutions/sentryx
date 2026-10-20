import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { apiGet, ApiError } from '../../lib/api';
import { useSchool } from '../../context/SchoolContext';
import { useTheme, ATTENDANCE_COLORS, radius } from '../../theme';
import { Alert, Avatar, Badge, Button, Card, Chip, Empty, ErrorBox, Row, Screen, Skeleton, T } from '../../ui';
import { fmtDate } from '../../lib/format';
import { ATTENDANCE_LABELS, EnrollmentHistory, Perm, ReportCard, StudentAttendance } from '../../types';
import type { RootStackParamList } from '../../navigation';

interface StudentDetail { id: number; firstName: string; lastName: string; photoUrl: string | null; dni: string | null; Enrollments?: Array<{ Division?: { name: string; Level?: { name: string } } }>; history?: EnrollmentHistory[] }
type Tab = 'boletin' | 'asistencia';

const gradeText = (g?: { numericValue: number | null; conceptualValue: string | null; narrative: string | null }) => {
  if (!g) return '—';
  if (g.numericValue != null) return String(g.numericValue);
  if (g.conceptualValue) return g.conceptualValue;
  if (g.narrative) return g.narrative;
  return '—';
};

/** Ficha del alumno: boletín (solo períodos publicados) y asistencia del año. */
export default function StudentScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Student'>>().params;
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session, can } = useSchool();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('boletin');
  // Boletín por ciclo: el alumno conserva los de años anteriores.
  const [yearId, setYearId] = useState<number | null>(null);

  const student = useQuery({ queryKey: ['student', id], queryFn: () => apiGet<StudentDetail>(`/school/students/${id}`) });
  const report = useQuery({ queryKey: ['report-card', id, yearId], queryFn: () => apiGet<ReportCard>(`/school/grades/report-card/${id}${yearId ? `?yearId=${yearId}` : ''}`), enabled: tab === 'boletin', retry: false });
  const years = student.data?.history ?? [];
  const currentYearId = session?.academicYearId ?? null;
  const attendance = useQuery({ queryKey: ['student-attendance', id], queryFn: () => apiGet<StudentAttendance>(`/school/attendance/student/${id}`), enabled: tab === 'asistencia' });
  const s = student.data;
  const division = s?.Enrollments?.[0]?.Division;
  const isFamily = !!session && !session.isStaff;
  const refetch = () => (tab === 'boletin' ? report.refetch() : attendance.refetch());
  const busy = tab === 'boletin' ? report.isRefetching : attendance.isRefetching;

  const periods = report.data?.periods.filter((p) => p.published !== false) ?? [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void refetch()} tintColor={colors.primary} />}>
      {student.error && <ErrorBox error={student.error} retry={student.refetch} />}
      {!s && !student.error && <Skeleton count={1} h={72} />}
      {s && (
        <Row>
          <Avatar name={`${s.firstName} ${s.lastName}`} uri={s.photoUrl} size={56} />
          <View style={{ flex: 1 }}>
            <T kind="h2">{s.firstName} {s.lastName}</T>
            <T kind="small" muted>{division ? `${division.name} · ${division.Level?.name ?? ''}` : 'Sin curso este año'}{s.dni ? ` · DNI ${s.dni}` : ''}</T>
          </View>
        </Row>
      )}
      {isFamily && <Button title="Escribirle a la escuela" kind="ghost" icon="message-circle" small style={{ alignSelf: 'flex-start' }} onPress={() => nav.navigate('NewThread', { studentId: id })} />}

      <Row style={{ gap: 8 }}>
        <Chip label="Boletín" active={tab === 'boletin'} onPress={() => setTab('boletin')} />
        <Chip label="Asistencia" active={tab === 'asistencia'} onPress={() => setTab('asistencia')} />
      </Row>

      {tab === 'boletin' && (
        <>
          {years.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {years.map((h) => <Chip key={h.academicYearId} label={`${h.year}${h.division ? ` · ${h.division.name}` : ''}`} active={(yearId ?? currentYearId) === h.academicYearId} onPress={() => setYearId(h.academicYearId === currentYearId ? null : h.academicYearId)} />)}
            </ScrollView>
          )}
          {report.isLoading && <Skeleton count={4} h={56} />}
          {report.error && (report.error instanceof ApiError && report.error.status === 404 ? <Empty icon="book" title="Todavía no hay boletín" text={yearId ? report.error.message : 'Aparece cuando la escuela publica las notas del período.'} /> : <ErrorBox error={report.error} retry={report.refetch} />)}
          {report.data && !periods.length && <Empty icon="book" title="Todavía no hay notas publicadas" />}
          {report.data && periods.length > 0 && (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <Row style={{ backgroundColor: colors.surface2, paddingVertical: 8, paddingHorizontal: 12, gap: 0 }}>
                    <T kind="xs" style={{ width: 150, fontWeight: '700' }}>Materia</T>
                    {periods.map((p) => <T key={p.id} kind="xs" style={{ width: 76, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{p.name}</T>)}
                    <T kind="xs" style={{ width: 64, fontWeight: '700', textAlign: 'center' }}>Final</T>
                  </Row>
                  {report.data.rows.map((r, i) => (
                    <Row key={r.subjectId} style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 0, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                      <T kind="small" style={{ width: 150, fontWeight: '600' }} numberOfLines={2}>{r.subject}</T>
                      {periods.map((p) => {
                        const g = r.grades[p.id];
                        const low = g?.numericValue != null && g.numericValue < report.data!.level.settings.passingGrade;
                        return <T key={p.id} kind="small" color={low || g?.atRisk ? colors.danger : undefined} style={{ width: 76, textAlign: 'center', fontWeight: low ? '800' : '500' }} numberOfLines={2}>{gradeText(g)}</T>;
                      })}
                      <T kind="small" color={r.finalApproved === false ? colors.danger : r.finalApproved ? colors.ok : undefined} style={{ width: 64, textAlign: 'center', fontWeight: '800' }}>{r.final ?? '—'}</T>
                    </Row>
                  ))}
                </View>
              </ScrollView>
            </Card>
          )}
          {report.data && <T kind="xs" muted>Nota de aprobación: {report.data.level.settings.passingGrade}. El boletín completo para imprimir está en la web.</T>}
        </>
      )}

      {tab === 'asistencia' && (
        <>
          {attendance.isLoading && <Skeleton count={4} h={56} />}
          {attendance.error && <ErrorBox error={attendance.error} retry={attendance.refetch} />}
          {attendance.data && (
            <>
              <Row style={{ flexWrap: 'wrap' }}>
                <Card style={{ flex: 1, minWidth: 100, padding: 12 }}><T kind="h1" color={attendance.data.summary.percent < 75 ? colors.danger : colors.ok}>{attendance.data.summary.percent}%</T><T kind="xs" muted>Asistencia</T></Card>
                <Card style={{ flex: 1, minWidth: 100, padding: 12 }}><T kind="h1">{attendance.data.summary.total}</T><T kind="xs" muted>Inasistencias</T></Card>
                <Card style={{ flex: 1, minWidth: 100, padding: 12 }}><T kind="h1" color={attendance.data.summary.unjustified ? colors.warn : undefined}>{attendance.data.summary.unjustified}</T><T kind="xs" muted>Sin justificar</T></Card>
              </Row>
              {attendance.data.summary.percent < 75 && <Alert tone="warn" icon="alert-triangle">La asistencia está por debajo del 75%. Si hay faltas por enfermedad, acercá el certificado a la escuela.</Alert>}
              {!attendance.data.records.length && <Empty icon="check-circle" title="Sin inasistencias registradas" />}
              {attendance.data.records.length > 0 && (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {attendance.data.records.map((r, i) => (
                    <Row key={r.id} style={{ padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                      <View style={{ width: 8, height: 32, borderRadius: radius.sm, backgroundColor: ATTENDANCE_COLORS[r.status].bg }} />
                      <View style={{ flex: 1 }}>
                        <T kind="small" style={{ fontWeight: '700' }}>{fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {ATTENDANCE_LABELS[r.status]}</T>
                        {!!r.note && <T kind="xs" muted>{r.note}</T>}
                      </View>
                      <Badge tone={r.justified ? 'ok' : 'warn'}>{r.justified ? 'Justificada' : 'Sin justificar'}</Badge>
                    </Row>
                  ))}
                </Card>
              )}
            </>
          )}
        </>
      )}
      {session?.isStaff && can(Perm.USERS_READ) && <T kind="xs" muted>Legajo completo, tutores y trayectoria: en la web.</T>}
    </Screen>
  );
}
