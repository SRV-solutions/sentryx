import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../context/SchoolContext';
import { useTheme, radius } from '../../theme';
import { Avatar, Badge, Chip, Empty, ErrorBox, IconButton, Input, Row, Skeleton, T } from '../../ui';
import { timeAgo, fullName } from '../../lib/format';
import { useRealtimeEvent } from '../../lib/realtime';
import { InboxItem, Paginated, Perm, announcementCategoryLabel } from '../../types';
import { WEB_URL } from '../../config';
import type { RootStackParamList } from '../../navigation';

type FilterKey = 'unread' | 'pendingAck' | 'priority' | 'attachments' | 'archived';
const FILTERS: Array<{ key: FilterKey; label: string; param: string }> = [
  { key: 'unread', label: 'Sin leer', param: 'unread=true' },
  { key: 'pendingAck', label: 'Pendientes', param: 'pendingAck=true' },
  { key: 'priority', label: 'Urgentes', param: 'priority=URGENT' },
  { key: 'attachments', label: 'Con adjuntos', param: 'attachments=true' },
  { key: 'archived', label: 'Archivados', param: 'archived=true' },
];

export default function AnnouncementsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { can } = useSchool();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [q2, setQ2] = useState('');
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  // Espera a que dejen de escribir antes de consultar.
  useEffect(() => {
    const t = setTimeout(() => setQ2(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  const toggle = (k: FilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const query = ['box=inbox', ...(q2 ? [`q=${encodeURIComponent(q2)}`] : []), ...FILTERS.filter((f) => filters.has(f.key)).map((f) => f.param)].join('&');
  const filtering = !!q2 || filters.size > 0;
  const q = useInfiniteQuery({
    queryKey: ['announcements', 'inbox', query],
    queryFn: ({ pageParam }) => apiGet<Paginated<InboxItem>>(`/school/announcements?${query}&page=${pageParam}&limit=20`),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.pagination.currentPage < l.pagination.totalPages ? l.pagination.currentPage + 1 : undefined),
  });
  useRealtimeEvent<{ type?: string }>('notification', (n) => n.type === 'announcement' && q.refetch());
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Row between style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <T kind="h1">Comunicados</T>
        {can(Perm.ANNOUNCEMENTS_CREATE) && <IconButton icon="edit-3" label="Nuevo comunicado (en la web)" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/comunicados/nuevo`)} />}
      </Row>
      <View style={{ paddingHorizontal: 16, gap: 8, paddingBottom: 4 }}>
        <Input value={search} onChangeText={setSearch} placeholder="Buscar comunicados…" returnKeyType="search" clearButtonMode="while-editing" autoCorrect={false} style={{ minHeight: 42 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => <Chip key={f.key} label={f.label} active={filters.has(f.key)} onPress={() => toggle(f.key)} />)}
        </ScrollView>
      </View>
      {q.error && <View style={{ padding: 16 }}><ErrorBox error={q.error} retry={q.refetch} /></View>}
      {q.isLoading && !rows.length && <View style={{ padding: 16 }}><Skeleton count={6} h={84} /></View>}
      <FlatList
        data={rows}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={!q.isLoading ? <Empty icon={filtering ? 'search' : 'bell'} title={filtering ? 'Nada coincide' : 'No hay comunicados'} text={filtering ? 'Probá con otras palabras o quitá los filtros.' : 'Cuando la escuela mande uno, aparece acá.'} /> : undefined}
        renderItem={({ item }) => {
          const unread = !item.readAt;
          const cat = announcementCategoryLabel(item.category);
          return (
            <Pressable onPress={() => nav.navigate('AnnouncementDetail', { id: item.id })} android_ripple={{ color: colors.surface2 }} style={({ pressed }) => [{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: unread ? colors.primary : colors.border, gap: 6 }, pressed && { opacity: 0.85 }]}>
              <Row>
                <Avatar name={fullName(item.author)} uri={item.author.avatar} size={34} />
                <View style={{ flex: 1 }}>
                  <T kind="xs" muted numberOfLines={1}>{fullName(item.author)} · {item.audienceLabel} · {timeAgo(item.createdAt)}</T>
                  <T kind="h3" numberOfLines={2} style={unread ? undefined : { fontWeight: '600' }}>{item.title}</T>
                </View>
                {unread && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
              </Row>
              <T kind="small" muted numberOfLines={2}>{item.preview}</T>
              {(!!cat || item.allowReplies || item.priority === 'URGENT' || item.requiresAck || item.hasAttachments || item.children.length > 0 || item.status === 'ARCHIVED') && (
                <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                  {item.status === 'ARCHIVED' && <Badge>Archivado</Badge>}
                  {cat && <Badge tone="info">{cat}</Badge>}
                  {item.priority === 'URGENT' && <Badge tone="danger">Urgente</Badge>}
                  {item.requiresAck && <Badge tone={item.ackAt ? 'ok' : 'warn'}>{item.ackAt ? 'Confirmado' : 'Pide confirmación'}</Badge>}
                  {item.hasAttachments && <Badge><Feather name="paperclip" size={11} /> Adjuntos</Badge>}
                  {/* Archivado ya no se puede responder (la API lo rechaza): solo queda "Respondiste" si hubo charla. */}
                  {item.allowReplies && (item.myThreadId || item.status !== 'ARCHIVED') && <Badge tone={item.myThreadId ? 'ok' : undefined}><Feather name="message-circle" size={11} /> {item.myThreadId ? 'Respondiste' : 'Podés responder'}</Badge>}
                  {item.children.map((c) => <Badge key={c}>{c}</Badge>)}
                </Row>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
