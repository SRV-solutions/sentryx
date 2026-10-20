import { useEffect } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import { apiGet, apiSend } from '../../lib/api';
import { useTheme, radius } from '../../theme';
import { Alert, Avatar, Badge, Button, Card, ErrorBox, Row, Screen, Skeleton, T, toast } from '../../ui';
import { fmtDateTime, fullName } from '../../lib/format';
import { AnnouncementDetail } from '../../types';
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
  const { colors } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['announcement', id], queryFn: () => apiGet<AnnouncementDetail>(`/school/announcements/${id}`) });
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
  const a = q.data;

  return (
    <Screen>
      {q.error && <ErrorBox error={q.error} retry={q.refetch} />}
      {!a && !q.error && <Skeleton count={2} h={120} />}
      {a && (
        <>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {a.priority === 'URGENT' && <Badge tone="danger">Urgente</Badge>}
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
          {a.stats && (
            <Card>
              <T kind="h3">Seguimiento</T>
              <T kind="small" muted>Leyeron {a.stats.read} de {a.stats.total}{a.requiresAck ? ` · confirmaron ${a.stats.ack}` : ''}. El detalle por familia está en la web.</T>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
