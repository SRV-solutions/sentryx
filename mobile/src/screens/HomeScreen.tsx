import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { apiGet } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../context/SchoolContext';
import { useTheme, radius } from '../theme';
import { Alert, Avatar, Badge, Card, IconButton, Row, Screen, Skeleton, T, Button } from '../ui';
import { fmtDate, greeting } from '../lib/format';
import { pushState, registerPush, PushState } from '../lib/push';
import { subscribePending, PendingAttendance } from '../lib/offlineAttendance';
import { Dashboard, Perm, ChildSummary } from '../types';
import type { RootStackParamList } from '../navigation';

const Stat = ({ value, label, tone, onPress }: { value: number | string; label: string; tone?: string; onPress?: () => void }) => (
  <Card style={{ flex: 1, minWidth: 140, padding: 14 }} onPress={onPress}>
    <T kind="h1" color={tone}>{value}</T>
    <T kind="xs" muted>{label}</T>
  </Card>
);

const ChildCard = ({ c, onPress }: { c: ChildSummary; onPress: () => void }) => (
  <Card onPress={onPress}>
    <Row>
      <Avatar name={`${c.firstName} ${c.lastName}`} uri={c.photoUrl} size={46} />
      <View style={{ flex: 1 }}>
        <T kind="h3">{c.firstName} {c.lastName}</T>
        <T kind="small" muted>{c.division ? `${c.division.name} · ${c.division.Level?.name ?? ''}` : 'Sin curso este año'}</T>
      </View>
      <Feather name="chevron-right" size={18} color="#8E8E8E" />
    </Row>
    <Row style={{ marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
      <Badge tone={c.attendance.absentToday ? 'danger' : 'ok'}>{c.attendance.absentToday ? 'Ausente hoy' : 'Presente hoy'}</Badge>
      <Badge>Asistencia {c.attendance.percent}%</Badge>
      <Badge>{c.attendance.absences} faltas</Badge>
      {c.lastReportCardAt && <Badge tone="info">Boletín {fmtDate(c.lastReportCardAt)}</Badge>}
    </Row>
  </Card>
);

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { session, can } = useSchool();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => apiGet<Dashboard>('/school/dashboard'), refetchInterval: 60_000 });
  const [push, setPush] = useState<PushState>('granted');
  const [pending, setPending] = useState<PendingAttendance[]>([]);
  useEffect(() => {
    pushState().then(setPush);
    return subscribePending(setPending);
  }, []);
  const d = q.data;
  const goTab = (screen: 'Asistencia' | 'Comunicados' | 'Mensajes' | 'Familia') => nav.navigate('Main', { screen });

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isFetching && !!d} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}>
      <Row between style={{ marginTop: insets.top + 8 }}>
        <View style={{ flex: 1 }}>
          <T kind="h1">{greeting()}, {user?.userData.firstName}<T kind="h1" color={colors.accent}>.</T></T>
          <T kind="small" muted numberOfLines={1}>{session?.school.name} · {session?.roleLabels.join(' · ')}</T>
        </View>
        <IconButton icon="bell" label="Notificaciones" onPress={() => nav.navigate('Notifications')} />
        <Pressable onPress={() => nav.navigate('Profile')} accessibilityLabel="Mi perfil">
          <Avatar name={`${user?.userData.firstName} ${user?.userData.lastName}`} uri={user?.userData.avatar} size={36} />
        </Pressable>
      </Row>

      {push === 'unknown' && (
        <Alert tone="info" icon="bell">
          <T kind="small"><T kind="small" style={{ fontWeight: '700' }}>Activá las notificaciones</T> para enterarte de comunicados y mensajes en el momento.</T>
          <Button title="Activar" small style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={() => registerPush().then(setPush)} />
        </Alert>
      )}
      {pending.length > 0 && (
        <Alert tone="warn" icon="wifi-off">
          <T kind="small"><T kind="small" style={{ fontWeight: '700' }}>{pending.length} {pending.length === 1 ? 'asistencia guardada en el celular' : 'asistencias guardadas en el celular'}.</T> Se envían solas cuando vuelva la conexión.</T>
        </Alert>
      )}

      {q.isLoading && !d && <Skeleton count={3} h={80} />}
      {d && (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            <Stat value={d.unreadAnnouncements} label="Comunicados sin leer" tone={d.unreadAnnouncements ? colors.primary : undefined} onPress={() => goTab('Comunicados')} />
            <Stat value={d.unreadThreads} label="Mensajes nuevos" tone={d.unreadThreads ? colors.primary : undefined} onPress={() => goTab('Mensajes')} />
          </Row>
          {d.pendingAck > 0 && (
            <Alert tone="warn" icon="check-circle">
              <T kind="small">Tenés <T kind="small" style={{ fontWeight: '700' }}>{d.pendingAck}</T> {d.pendingAck === 1 ? 'comunicado que pide confirmación' : 'comunicados que piden confirmación'}.</T>
            </Alert>
          )}
          {session?.isStaff && (
            <Row style={{ flexWrap: 'wrap' }}>
              {d.attendanceToday && (
                <Stat value={`${d.attendanceToday.taken}/${d.attendanceToday.divisions}`} label={`Asistencia tomada hoy · ${d.attendanceToday.absent} ausentes`} tone={d.attendanceToday.taken < d.attendanceToday.divisions ? colors.warn : colors.ok} onPress={() => can(Perm.ATTENDANCE_UPDATE) && goTab('Asistencia')} />
              )}
              {d.alerts && <Stat value={(d.alerts.CRITICAL ?? 0) + (d.alerts.WARNING ?? 0) + (d.alerts.INFO ?? 0)} label="Alertas de asistencia activas" tone={d.alerts.CRITICAL ? colors.danger : undefined} />}
            </Row>
          )}
          {!!d.children?.length && (
            <>
              <T kind="h2">{d.children.length > 1 ? 'Tus hijos' : 'Tu hijo/a'}</T>
              {d.children.map((c) => <ChildCard key={c.id} c={c} onPress={() => nav.navigate('Student', { id: c.id, name: `${c.firstName} ${c.lastName}` })} />)}
            </>
          )}
          {d.me && (
            <>
              <T kind="h2">Mi curso</T>
              <ChildCard c={d.me} onPress={() => nav.navigate('Student', { id: d.me!.id, name: 'Mi boletín' })} />
            </>
          )}
        </>
      )}

      {session?.isStaff && (
        <>
          <T kind="h2">Accesos rápidos</T>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {[
              ...(can(Perm.ATTENDANCE_UPDATE) ? [{ icon: 'check-square' as const, label: 'Tomar asistencia', go: () => goTab('Asistencia') }] : []),
              ...(can(Perm.ANNOUNCEMENTS_CREATE) ? [{ icon: 'bell' as const, label: 'Comunicados', go: () => goTab('Comunicados') }] : []),
              { icon: 'message-circle' as const, label: 'Mensajes', go: () => goTab('Mensajes') },
            ].map((item, i, arr) => (
              <Pressable key={item.label} onPress={item.go} android_ripple={{ color: colors.surface2 }} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border, borderRadius: radius.lg }, pressed && { backgroundColor: colors.surface2 }]}>
                <Feather name={item.icon} size={20} color={colors.primary} />
                <T style={{ flex: 1 }}>{item.label}</T>
                <Feather name="chevron-right" size={18} color={colors.text3} />
              </Pressable>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
