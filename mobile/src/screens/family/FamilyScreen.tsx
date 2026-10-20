import { useEffect } from 'react';
import { RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../theme';
import { Avatar, Card, Empty, ErrorBox, Row, Screen, Skeleton, T } from '../../ui';
import { Child } from '../../types';
import type { RootStackParamList } from '../../navigation';

/** Familias: sus hijos. Estudiantes: va directo a su propio boletín. */
export default function FamilyScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useSchool();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['my-children'], queryFn: () => apiGet<Child[]>('/school/my-children'), enabled: !!session?.isGuardian });

  useEffect(() => {
    if (session?.self && !session.isGuardian) nav.navigate('Student', { id: session.self.studentId, name: 'Mi boletín' });
  }, [session, nav]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}>
      <T kind="h1" style={{ marginTop: insets.top + 8 }}>{(q.data?.length ?? 0) > 1 ? 'Mis hijos' : 'Mi hijo/a'}</T>
      {q.error && <ErrorBox error={q.error} retry={q.refetch} />}
      {q.isLoading && !q.data && <Skeleton count={2} h={80} />}
      {q.data && !q.data.length && <Empty icon="smile" title="Todavía no tenés hijos vinculados" text="Pedile a la secretaría que vincule tu cuenta." />}
      {q.data?.map((c) => {
        const division = c.Enrollments?.[0]?.Division;
        return (
          <Card key={c.id} onPress={() => nav.navigate('Student', { id: c.id, name: `${c.firstName} ${c.lastName}` })}>
            <Row>
              <Avatar name={`${c.firstName} ${c.lastName}`} uri={c.photoUrl} size={48} />
              <View style={{ flex: 1 }}>
                <T kind="h3">{c.firstName} {c.lastName}</T>
                <T kind="small" muted>{division ? `${division.name} · ${division.Level?.name ?? ''}` : 'Sin curso este año'}</T>
              </View>
              <Feather name="chevron-right" size={18} color={colors.text3} />
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
