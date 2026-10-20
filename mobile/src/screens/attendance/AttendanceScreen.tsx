import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { apiGet, apiSend, ApiError } from '../../lib/api';
import { useTheme, ATTENDANCE_COLORS, radius } from '../../theme';
import { Alert, Avatar, Button, Chip, Empty, ErrorBox, Row, Skeleton, T, toast } from '../../ui';
import { dayLabel, localToday, fullName } from '../../lib/format';
import { queueAttendance, subscribePending, syncPending, PendingAttendance } from '../../lib/offlineAttendance';
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, AttendanceStatus, DivisionDay, TodayRow } from '../../types';

type RowState = { status: AttendanceStatus; justified: boolean };
const ROW_HEIGHT = 64;
const nextStatus = (s: AttendanceStatus) => ATTENDANCE_STATUSES[(ATTENDANCE_STATUSES.indexOf(s) + 1) % ATTENDANCE_STATUSES.length];

/**
 * Pase de lista desde el celular. Todos arrancan "Presente": se toca al alumno para cambiar el estado
 * (Presente → Ausente → Tarde → Retiro). Si no hay señal, queda guardado en el celular y se envía después.
 */
export default function AttendanceScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [date, setDate] = useState(localToday());
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [dirty, setDirty] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pending, setPending] = useState<PendingAttendance[]>([]);
  useEffect(() => subscribePending(setPending), []);

  const today = useQuery({ queryKey: ['attendance-today', date], queryFn: () => apiGet<TodayRow[]>(`/school/attendance/today?date=${date}`) });
  useEffect(() => {
    if (today.data?.length && (!divisionId || !today.data.some((d) => d.division.id === divisionId))) setDivisionId((today.data.find((d) => !d.taken) ?? today.data[0]).division.id);
  }, [today.data, divisionId]);

  const day = useQuery({
    queryKey: ['attendance-day', divisionId, date],
    queryFn: () => apiGet<DivisionDay>(`/school/attendance/division/${divisionId}?date=${date}`),
    enabled: !!divisionId,
  });
  useEffect(() => {
    if (!day.data) return;
    // Si hay un pase de lista pendiente de enviar para este curso y día, se muestra ese (es el más nuevo).
    const queued = pending.find((p) => p.divisionId === day.data!.division.id && p.date === day.data!.date);
    setRows(queued ? Object.fromEntries(queued.records.map((r) => [r.studentId, { status: r.status, justified: r.justified }])) : Object.fromEntries(day.data.students.map((s) => [s.student.id, { status: s.status, justified: s.justified }])));
    setDirty(!!queued);
  }, [day.data, pending]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { PRESENTE: 0, AUSENTE: 0, TARDE: 0, RETIRO: 0 };
    Object.values(rows).forEach((r) => c[r.status]++);
    return c;
  }, [rows]);

  const cycle = useCallback((studentId: number) => {
    Haptics.selectionAsync().catch(() => {});
    setRows((r) => ({ ...r, [studentId]: { status: nextStatus(r[studentId]?.status ?? 'PRESENTE'), justified: false } }));
    setDirty(true);
  }, []);
  const toggleJustified = useCallback((studentId: number) => {
    setRows((r) => ({ ...r, [studentId]: { ...r[studentId], justified: !r[studentId].justified } }));
    setDirty(true);
  }, []);
  const markAll = (status: AttendanceStatus) => {
    setRows((r) => Object.fromEntries(Object.keys(r).map((id) => [id, { status, justified: false }])));
    setDirty(true);
  };

  const records = () => Object.entries(rows).map(([studentId, r]) => ({ studentId: Number(studentId), status: r.status, justified: r.justified }));
  const save = useMutation({
    mutationFn: () => apiSend('PUT', `/school/attendance/division/${divisionId}`, { date, records: records() }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Asistencia guardada ✅');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-day', divisionId, date] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      // Pasa sola al próximo curso pendiente: menos toques entre aula y aula.
      const next = today.data?.find((d) => !d.taken && d.division.id !== divisionId);
      if (next) setDivisionId(next.division.id);
    },
    onError: async (e: Error) => {
      if (e instanceof ApiError && e.isNetwork && divisionId && day.data) {
        await queueAttendance({ divisionId, divisionName: day.data.division.name, date, records: records() });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        toast('Sin señal: la asistencia quedó guardada en el celular y se envía sola cuando vuelva la conexión.');
        setDirty(false);
      } else toast(e.message, true);
    },
  });

  const onPickDate = (_e: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) {
      setDate(`${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, '0')}-${String(picked.getDate()).padStart(2, '0')}`);
      setDivisionId(null);
    }
  };

  const students = day.data?.students ?? [];
  const current = today.data?.find((d) => d.division.id === divisionId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        <Row between>
          <T kind="h1">Asistencia</T>
          <Pressable onPress={() => setShowPicker(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface2 }}>
            <Feather name="calendar" size={16} color={colors.text} />
            <T kind="small" style={{ fontWeight: '700' }}>{dayLabel(date)}</T>
          </Pressable>
        </Row>
        {showPicker && <DateTimePicker value={new Date(`${date}T12:00:00`)} mode="date" maximumDate={new Date()} display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={onPickDate} />}
        {pending.length > 0 && (
          <Alert tone="warn" icon="wifi-off">
            <Row between>
              <T kind="small" style={{ flex: 1 }}>{pending.length} {pending.length === 1 ? 'pase de lista pendiente de enviar' : 'pases de lista pendientes de enviar'}.</T>
              <Button title="Enviar" small kind="ghost" onPress={() => syncPending().then((n) => toast(n ? `Se enviaron ${n}` : 'Todavía sin conexión', !n))} />
            </Row>
          </Alert>
        )}
        {today.isLoading && !today.data && <Skeleton count={1} h={40} />}
        {!!today.data?.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {today.data.map((d) => <Chip key={d.division.id} label={`${d.taken ? '✓ ' : ''}${d.division.name}`} active={d.division.id === divisionId} tone={d.taken ? 'ok' : undefined} onPress={() => setDivisionId(d.division.id)} />)}
          </ScrollView>
        )}
      </View>

      {today.error && <View style={{ padding: 16 }}><ErrorBox error={today.error} retry={today.refetch} /></View>}
      {today.data && !today.data.length && <Empty icon="users" title="No tenés cursos para tomar asistencia" text="Pedile a la conducción que te asigne tus cursos." />}
      {day.isLoading && !day.data && <View style={{ padding: 16 }}><Skeleton count={6} h={ROW_HEIGHT} /></View>}

      {!!students.length && (
        <FlatList
          data={students}
          keyExtractor={(s) => String(s.student.id)}
          getItemLayout={(_d, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          initialNumToRender={14}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={{ padding: 16, paddingBottom: 140 + insets.bottom }}
          ListHeaderComponent={
            <Row between style={{ marginBottom: 8 }}>
              <T kind="small" muted>{current?.taken ? 'Ya tomada: podés corregirla.' : 'Tocá a quien falta.'}</T>
              <Row style={{ gap: 6 }}>
                <Chip label="Todos presentes" onPress={() => markAll('PRESENTE')} />
              </Row>
            </Row>
          }
          renderItem={({ item }) => {
            const r = rows[item.student.id] ?? { status: item.status, justified: item.justified };
            const c = ATTENDANCE_COLORS[r.status];
            return (
              <Pressable onPress={() => cycle(item.student.id)} android_ripple={{ color: colors.surface2 }} style={({ pressed }) => [{ height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface, marginBottom: 6, borderWidth: 1, borderColor: r.status === 'PRESENTE' ? colors.border : c.bg }, pressed && { opacity: 0.85 }]}>
                <Avatar name={fullName(item.student)} uri={item.student.photoUrl} size={36} />
                <View style={{ flex: 1 }}>
                  <T kind="h3" numberOfLines={1}>{item.student.lastName}, {item.student.firstName}</T>
                  {r.status !== 'PRESENTE' && (
                    <Pressable onPress={() => toggleJustified(item.student.id)} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
                      <T kind="xs" color={r.justified ? colors.ok : colors.text3}>{r.justified ? '✓ Justificada' : 'Tocá para justificar'}</T>
                    </Pressable>
                  )}
                </View>
                <View style={{ minWidth: 92, height: 36, borderRadius: radius.sm, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}>
                  <T kind="small" color={c.fg} style={{ fontWeight: '800' }}>{ATTENDANCE_LABELS[r.status]}</T>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {!!students.length && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: insets.bottom + 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
          <Row style={{ justifyContent: 'center', gap: 12 }}>
            {ATTENDANCE_STATUSES.map((s) => (
              <T key={s} kind="xs" color={ATTENDANCE_COLORS[s].bg === '#F6950A' ? colors.warn : ATTENDANCE_COLORS[s].bg} style={{ fontWeight: '700' }}>{counts[s]} {ATTENDANCE_LABELS[s].toLowerCase()}</T>
            ))}
          </Row>
          <Button title={dirty ? 'Guardar asistencia' : current?.taken ? 'Asistencia guardada' : 'Guardar asistencia'} kind="accent" icon="save" loading={save.isPending} disabled={!dirty && !!current?.taken} onPress={() => save.mutate()} />
        </View>
      )}
    </View>
  );
}
