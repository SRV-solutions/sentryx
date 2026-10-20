import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import { apiGet, apiSend } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme, radius } from '../../theme';
import { Alert, ErrorBox, IconButton, Input, Skeleton, T, keyboardBehavior, toast } from '../../ui';
import { fmtDate, fmtTime } from '../../lib/format';
import { useRealtimeEvent } from '../../lib/realtime';
import { Message, ThreadData } from '../../types';
import type { RootStackParamList } from '../../navigation';

export default function ThreadScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Thread'>>().params;
  const nav = useNavigation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = user?.userData.id ?? 0;
  const [text, setText] = useState('');
  const key = ['thread', id];

  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => apiGet<ThreadData>(`/school/threads/${id}${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.id : undefined),
  });
  const thread = q.data?.pages[0]?.thread;
  useLayoutEffect(() => {
    if (thread) nav.setOptions({ title: thread.subject });
  }, [thread, nav]);

  // Al abrir, queda como leída (y bajan los contadores).
  useEffect(() => {
    apiSend('POST', `/school/threads/${id}/read`).then(() => {
      qc.invalidateQueries({ queryKey: ['threads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }).catch(() => {});
  }, [id, qc]);

  const append = useCallback(
    (m: Message) => {
      qc.setQueryData<InfiniteData<ThreadData>>(key, (old) => {
        if (!old) return old;
        const first = old.pages[0];
        if (first.messages.some((x) => x.id === m.id)) return old;
        return { ...old, pages: [{ ...first, messages: [...first.messages, m] }, ...old.pages.slice(1)] };
      });
    },
    [qc, key]
  );
  useRealtimeEvent<{ threadId: number; message: Message }>('thread_message', (p) => {
    if (p.threadId !== id) return;
    append(p.message);
    if (p.message.senderId !== me) apiSend('POST', `/school/threads/${id}/read`).catch(() => {});
  });

  const send = useMutation({
    mutationFn: (body: string) => apiSend<Message>('POST', `/school/threads/${id}/messages`, { body }),
    onSuccess: (m) => (append(m), qc.invalidateQueries({ queryKey: ['threads'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    send.mutate(body);
  };

  // Lista invertida: el último mensaje abajo, y cargar más antiguos al llegar arriba.
  const messages = [...(q.data?.pages.flatMap((p) => p.messages) ?? [])].sort((a, b) => a.id - b.id).reverse();
  const participants = q.data?.pages[0]?.participants ?? [];
  const nameOf = (senderId: number) => {
    const p = participants.find((x) => x.id === senderId);
    return p ? `${p.firstName} ${p.lastName}` : '';
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={keyboardBehavior} keyboardVerticalOffset={90}>
      {q.error && <View style={{ padding: 16 }}><ErrorBox error={q.error} retry={q.refetch} /></View>}
      {q.isLoading && !q.data && <View style={{ padding: 16 }}><Skeleton count={5} h={56} /></View>}
      {thread?.student && (
        <View style={{ padding: 12, paddingBottom: 0 }}>
          <T kind="xs" muted style={{ textAlign: 'center' }}>Sobre {thread.student.firstName} {thread.student.lastName} · {participants.map((p) => `${p.firstName} (${p.roleLabel})`).join(', ')}</T>
        </View>
      )}
      <FlatList
        data={messages}
        inverted
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        onEndReachedThreshold={0.6}
        renderItem={({ item, index }) => {
          const mine = item.senderId === me;
          const prev = messages[index + 1];
          const newDay = !prev || fmtDate(prev.createdAt) !== fmtDate(item.createdAt);
          return (
            <View>
              {newDay && <T kind="xs" muted style={{ textAlign: 'center', marginVertical: 8 }}>{fmtDate(item.createdAt, { weekday: 'long', day: 'numeric', month: 'long' })}</T>}
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '84%', backgroundColor: mine ? colors.primary : colors.bubbleOther, borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6, paddingHorizontal: 14, paddingVertical: 9 }}>
                {!mine && participants.length > 2 && <T kind="xs" color={colors.accent} style={{ fontWeight: '700' }}>{nameOf(item.senderId)}</T>}
                <T color={mine ? '#fff' : colors.text}>{item.body}</T>
                {item.attachments?.map((f, i) => (
                  <Pressable key={i} onPress={() => WebBrowser.openBrowserAsync(f.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <Feather name="paperclip" size={14} color={mine ? '#fff' : colors.primary} />
                    <T kind="small" color={mine ? '#fff' : colors.primary} numberOfLines={1} style={{ textDecorationLine: 'underline' }}>{f.name}</T>
                  </Pressable>
                ))}
                <T kind="xs" color={mine ? 'rgba(255,255,255,0.75)' : colors.text3} style={{ marginTop: 3, alignSelf: 'flex-end' }}>{fmtTime(item.createdAt)}</T>
              </View>
            </View>
          );
        }}
      />
      {thread?.closedAt ? (
        <View style={{ padding: 12, paddingBottom: insets.bottom + 12 }}><Alert tone="info" icon="lock">La institución cerró esta conversación.</Alert></View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, paddingBottom: insets.bottom + 10, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Input value={text} onChangeText={setText} placeholder="Escribí un mensaje…" multiline style={{ flex: 1, maxHeight: 120, paddingTop: 12, borderRadius: radius.lg }} />
          <View style={{ backgroundColor: text.trim() ? colors.primary : colors.surface2, borderRadius: 24 }}>
            <IconButton icon="send" label="Enviar" color={text.trim() ? '#fff' : colors.text3} onPress={submit} />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
