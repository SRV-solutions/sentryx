import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '../../lib/api';
import { useTheme, radius } from '../../theme';
import { Avatar, Badge, Empty, ErrorBox, IconButton, Row, Skeleton, T } from '../../ui';
import { timeAgo } from '../../lib/format';
import { useRealtimeEvent } from '../../lib/realtime';
import { ThreadRow } from '../../types';
import type { RootStackParamList } from '../../navigation';

export default function ThreadsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['threads'], queryFn: () => apiGet<ThreadRow[]>('/school/threads') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['threads'] });
  useRealtimeEvent('thread_message', refresh);
  useRealtimeEvent('thread_updated', refresh);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Row between style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <T kind="h1">Mensajes</T>
        <IconButton icon="edit" label="Nuevo mensaje" onPress={() => nav.navigate('NewThread')} />
      </Row>
      {q.error && <View style={{ padding: 16 }}><ErrorBox error={q.error} retry={q.refetch} /></View>}
      {q.isLoading && !q.data && <View style={{ padding: 16 }}><Skeleton count={6} h={72} /></View>}
      <FlatList
        data={q.data ?? []}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
        ListEmptyComponent={!q.isLoading ? <Empty icon="message-circle" title="Sin conversaciones" text="Escribile a la escuela sobre tu hijo/a con el botón de arriba." /> : undefined}
        renderItem={({ item }) => {
          const other = item.others?.[0];
          const name = item.others?.map((o) => o.name).join(', ') || 'Conversación';
          return (
            <Pressable onPress={() => nav.navigate('Thread', { id: item.id })} android_ripple={{ color: colors.surface2 }} style={({ pressed }) => [{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: item.unread ? colors.primary : colors.border, flexDirection: 'row', gap: 12, alignItems: 'center', opacity: item.closedAt ? 0.6 : 1 }, pressed && { opacity: 0.85 }]}>
              <Avatar name={name} uri={other?.avatar} size={42} />
              <View style={{ flex: 1, gap: 2 }}>
                <Row between>
                  <T kind="h3" numberOfLines={1} style={{ flex: 1 }}>{item.subject}</T>
                  <T kind="xs" muted>{timeAgo(item.lastMessageAt)}</T>
                </Row>
                <T kind="xs" muted numberOfLines={1}>{name}{other?.roleLabel ? ` · ${other.roleLabel}` : ''}{item.studentFirstName ? ` · ${item.studentFirstName} ${item.studentLastName}` : ''}</T>
                <T kind="small" numberOfLines={1} style={item.unread ? { fontWeight: '700' } : undefined} muted={!item.unread}>{item.lastMessagePreview}</T>
              </View>
              {item.unread > 0 && <Badge tone="accent">{item.unread}</Badge>}
              {!!item.closedAt && <Badge>Cerrada</Badge>}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
