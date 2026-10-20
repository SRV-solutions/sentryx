import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { apiGet, apiSend } from '../lib/api';
import { useTheme, radius } from '../theme';
import { Button, Empty, ErrorBox, Row, Skeleton, T } from '../ui';
import { timeAgo } from '../lib/format';
import { useRealtimeEvent } from '../lib/realtime';
import { NotificationRow } from '../types';
import { openPath } from '../navigation';

const ICONS: Record<string, keyof typeof Feather.glyphMap> = { announcement: 'bell', thread: 'message-circle', attendance: 'check-square', grades: 'book', alert: 'alert-triangle' };

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => apiGet<NotificationRow[]>('/notifications?limit=50') });
  useRealtimeEvent('notification', () => qc.invalidateQueries({ queryKey: ['notifications'] }));
  const markRead = useMutation({ mutationFn: (id: number) => apiSend('PATCH', `/notifications/${id}`, { read: true }), onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readAll = useMutation({ mutationFn: () => apiSend('POST', '/notifications/read-all'), onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = q.data?.filter((n) => !n.read).length ?? 0;

  const open = (n: NotificationRow) => {
    if (!n.read) markRead.mutate(n.notificationId);
    openPath(n.Notification.link);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {unread > 0 && (
        <Row between style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <T kind="small" muted>{unread} sin leer</T>
          <Button title="Marcar todas como leídas" kind="ghost" small loading={readAll.isPending} onPress={() => readAll.mutate()} />
        </Row>
      )}
      {q.error && <View style={{ padding: 16 }}><ErrorBox error={q.error} retry={q.refetch} /></View>}
      {q.isLoading && !q.data && <View style={{ padding: 16 }}><Skeleton count={6} h={64} /></View>}
      <FlatList
        data={q.data ?? []}
        keyExtractor={(n) => String(n.notificationId)}
        contentContainerStyle={{ padding: 16, gap: 6, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
        ListEmptyComponent={!q.isLoading ? <Empty icon="bell-off" title="Sin notificaciones" /> : undefined}
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item)} android_ripple={{ color: colors.surface2 }} style={({ pressed }) => [{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: item.read ? colors.surface : colors.infoBg, borderWidth: 1, borderColor: colors.border }, pressed && { opacity: 0.85 }]}>
            <Feather name={ICONS[item.Notification.type ?? ''] ?? 'info'} size={20} color={colors.primary} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T kind="small" style={{ fontWeight: item.read ? '600' : '800' }}>{item.Notification.title}</T>
              <T kind="small" muted numberOfLines={2}>{item.Notification.message}</T>
              <T kind="xs" muted>{timeAgo(item.Notification.createdAt)}</T>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
