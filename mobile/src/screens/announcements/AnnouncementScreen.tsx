import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Pressable, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import { apiGet, apiSend } from '../../lib/api';
import { useTheme, radius } from '../../theme';
import { Alert, Avatar, Badge, Button, Card, ErrorBox, Input, Row, Screen, Skeleton, T, keyboardBehavior, toast } from '../../ui';
import { fmtDateTime, fullName, timeAgo } from '../../lib/format';
import { useRealtimeEvent } from '../../lib/realtime';
import { AnnouncementDetail, Message, announcementCategoryLabel } from '../../types';
import type { RootStackParamList } from '../../navigation';

/** Texto con links tocables (el contenido se muestra siempre como texto, nunca como HTML). */
const Linkified = ({ text }: { text: string }) => {
  const { colors } = useTheme();
  return (
    <T style={{ fontSize: 16, lineHeight: 24 }}>
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? <T key={i} color={colors.primary} style={{ fontSize: 16, lineHeight: 24 }} onPress={() => Linking.openURL(part)}>{part}</T> : part
      )}
    </T>
  );
};

export default function AnnouncementScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'AnnouncementDetail'>>().params;
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const q = useQuery({ queryKey: ['announcement', id], queryFn: () => apiGet<AnnouncementDetail>(`/school/announcements/${id}`) });
  // Quien lo mandó ve llegar las respuestas sin recargar (cada una es un hilo privado con esa persona).
  const isAuthorView = !!q.data?.replies;
  const refreshReplies = () => isAuthorView && qc.invalidateQueries({ queryKey: ['announcement', id] });
  useRealtimeEvent('thread_updated', refreshReplies);
  useRealtimeEvent('thread_message', refreshReplies);
  // Abrirlo lo marca como leído en el servidor: se refrescan la lista y el contador del inicio.
  useEffect(() => {
    if (q.data && !q.data.myReceipt?.readAt) {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [q.data, qc]);
  const ack = useMutation({
    mutationFn: () => apiSend('POST', `/school/announcements/${id}/ack`),
    onSuccess: () => {
      toast('Confirmaste la lectura ✅');
      q.refetch();
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });
  // La respuesta abre (o continúa) una conversación 1 a 1 con quien lo mandó; nadie más del público la ve.
  const answer = useMutation({
    mutationFn: (body: string) => apiSend<{ threadId: number; message: Message }>('POST', `/school/announcements/${id}/reply`, { body }),
    onSuccess: (r) => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['announcement', id] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['threads'] });
      nav.navigate('Thread', { id: r.threadId });
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const a = q.data;
  const cat = announcementCategoryLabel(a?.category);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={keyboardBehavior} keyboardVerticalOffset={90}>
    <Screen>
      {q.error && <ErrorBox error={q.error} retry={q.refetch} />}
      {!a && !q.error && <Skeleton count={2} h={120} />}
      {a && (
        <>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {a.priority === 'URGENT' && <Badge tone="danger">Urgente</Badge>}
            {cat && <Badge tone="info">{cat}</Badge>}
            <Badge>Para: {a.audienceLabel}</Badge>
          </Row>
          <T kind="h1">{a.title}</T>
          <Row>
            <Avatar name={fullName(a.Author)} uri={a.Author.avatar} size={34} />
            <View>
              <T kind="small" style={{ fontWeight: '700' }}>{fullName(a.Author)}</T>
              <T kind="xs" muted>{fmtDateTime(a.createdAt)}</T>
            </View>
          </Row>
          <Linkified text={a.body} />
          {a.attachments.length > 0 && (
            <Card style={{ padding: 8 }}>
              {a.attachments.map((f, i) => (
                <Pressable key={i} onPress={() => WebBrowser.openBrowserAsync(f.url)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.sm }, pressed && { backgroundColor: colors.surface2 }]}>
                  <Feather name="paperclip" size={18} color={colors.primary} />
                  <T kind="small" style={{ flex: 1 }} numberOfLines={1}>{f.name}</T>
                  <Feather name="external-link" size={16} color={colors.text3} />
                </Pressable>
              ))}
            </Card>
          )}
          {a.requiresAck && a.myReceipt && (
            a.myReceipt.ackAt ? (
              <Alert tone="ok" icon="check-circle">Confirmaste que lo leíste el {fmtDateTime(a.myReceipt.ackAt)}.</Alert>
            ) : (
              <Card>
                <T kind="small" muted style={{ marginBottom: 10 }}>La escuela pide que confirmes que recibiste este comunicado.</T>
                <Button title="Confirmar lectura" kind="accent" icon="check" loading={ack.isPending} onPress={() => ack.mutate()} />
              </Card>
            )
          )}
          {a.myThreadId ? (
            <Button title="Ver conversación" kind="ghost" icon="message-circle" onPress={() => nav.navigate('Thread', { id: a.myThreadId! })} />
          ) : a.canReply ? (
            <Card style={{ gap: 10 }}>
              <T kind="small" muted>Tu respuesta le llega solo a {fullName(a.Author)}: nadie más de los destinatarios la ve.</T>
              <Input value={reply} onChangeText={setReply} multiline maxLength={5000} placeholder="Escribí tu respuesta…" style={{ minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }} />
              <Button title="Responder" icon="send" loading={answer.isPending} disabled={!reply.trim()} onPress={() => answer.mutate(reply.trim())} />
            </Card>
          ) : null}
          {a.replies && (a.allowReplies || a.replies.total > 0) && (
            <Card style={{ gap: 4 }}>
              <Row between>
                <T kind="h3">Respuestas</T>
                {a.replies.unread > 0 && <Badge tone="accent">{a.replies.unread} sin leer</Badge>}
              </Row>
              {a.replies.items.length === 0 ? (
                <T kind="small" muted>Todavía nadie respondió. Cada respuesta te llega como una conversación privada.</T>
              ) : (
                a.replies.items.map((r) => (
                  <Pressable key={r.threadId} onPress={() => nav.navigate('Thread', { id: r.threadId })} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderRadius: radius.sm }, pressed && { backgroundColor: colors.surface2 }]}>
                    <Avatar name={fullName(r.user)} uri={r.user.avatar} size={36} />
                    <View style={{ flex: 1 }}>
                      <Row between>
                        <T kind="small" numberOfLines={1} style={{ flex: 1, fontWeight: r.unread ? '800' : '600' }}>{fullName(r.user)}</T>
                        <T kind="xs" muted>{timeAgo(r.lastMessageAt)}</T>
                      </Row>
                      <T kind="xs" muted numberOfLines={1}>{r.roleLabel}{r.lastMessagePreview ? ` · ${r.lastMessagePreview}` : ''}</T>
                    </View>
                    {r.unread > 0 && <Badge tone="accent">{r.unread}</Badge>}
                  </Pressable>
                ))
              )}
              {a.replies.total > a.replies.items.length && <T kind="xs" muted>Mostrando {a.replies.items.length} de {a.replies.total}. Las demás están en Mensajes.</T>}
            </Card>
          )}
          {a.stats && (
            <Card>
              <T kind="h3">Seguimiento</T>
              <T kind="small" muted>Leyeron {a.stats.read} de {a.stats.total}{a.requiresAck ? ` · confirmaron ${a.stats.ack}` : ''}. El detalle por familia está en la web.</T>
            </Card>
          )}
        </>
      )}
    </Screen>
    </KeyboardAvoidingView>
  );
}
