import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '../../lib/api';
import { useSchool } from '../../context/SchoolContext';
import { useTheme, radius } from '../../theme';
import { Avatar, Button, Field, Input, Screen, Skeleton, T, keyboardBehavior, toast } from '../../ui';
import { Child, Contact, Paginated, Perm } from '../../types';
import type { RootStackParamList } from '../../navigation';

interface StudentLite { id: number; firstName: string; lastName: string; Enrollments?: Array<{ Division?: { name: string } }> }

/** Nuevo mensaje: elegir al alumno, a quién va dirigido y escribir. Las familias solo ven a sus hijos. */
export default function NewThreadScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const params = useRoute<RouteProp<RootStackParamList, 'NewThread'>>().params;
  const { session, can } = useSchool();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState<number | null>(params?.studentId ?? session?.self?.studentId ?? null);
  const [search, setSearch] = useState('');
  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const staff = !!session?.isStaff && can(Perm.MESSAGES_MANAGE);

  const children = useQuery({ queryKey: ['my-children'], queryFn: () => apiGet<Child[]>('/school/my-children'), enabled: !staff && !!session?.isGuardian });
  useEffect(() => {
    if (!studentId && children.data?.length === 1) setStudentId(children.data[0].id);
  }, [children.data, studentId]);
  const students = useQuery({
    queryKey: ['students-search', search],
    queryFn: () => apiGet<Paginated<StudentLite>>(`/school/students?q=${encodeURIComponent(search)}&limit=15`),
    enabled: staff && search.trim().length >= 2,
  });
  const contacts = useQuery({ queryKey: ['thread-contacts', studentId], queryFn: () => apiGet<Contact[]>(`/school/threads/contacts?studentId=${studentId}`), enabled: !!studentId });

  const create = useMutation({
    mutationFn: () => apiSend<{ id: number }>('POST', '/school/threads', { studentId, recipientId, subject: subject.trim(), body: body.trim() }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['threads'] });
      nav.replace('Thread', { id: t.id });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const option = (key: string | number, title: string, subtitle: string | null, active: boolean, onPress: () => void, avatar?: string | null) => (
    <Pressable key={key} onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.infoBg : colors.surface }, pressed && { opacity: 0.8 }]}>
      <Avatar name={title} uri={avatar} size={32} />
      <View style={{ flex: 1 }}>
        <T kind="small" style={{ fontWeight: '700' }}>{title}</T>
        {subtitle && <T kind="xs" muted>{subtitle}</T>}
      </View>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardBehavior} keyboardVerticalOffset={90}>
      <Screen>
        {!session?.self && (
          <Field label={staff ? 'Alumno' : 'Sobre cuál de tus hijos'}>
            {staff && <Input placeholder="Buscar alumno por nombre o DNI" value={search} onChangeText={(v) => (setSearch(v), setStudentId(null), setRecipientId(null))} autoCorrect={false} />}
            <View style={{ gap: 6 }}>
              {(staff ? students.data?.data ?? [] : children.data ?? []).map((s) =>
                option(s.id, `${s.firstName} ${s.lastName}`, s.Enrollments?.[0]?.Division?.name ?? null, studentId === s.id, () => (setStudentId(s.id), setRecipientId(null)))
              )}
              {!staff && children.isLoading && <Skeleton count={2} h={52} />}
            </View>
          </Field>
        )}
        {!!studentId && (
          <Field label="Para">
            {contacts.isLoading && <Skeleton count={3} h={52} />}
            <View style={{ gap: 6 }}>
              {contacts.data?.map((c) => option(c.userId, c.name, [c.role, c.detail].filter(Boolean).join(' · '), recipientId === c.userId, () => setRecipientId(c.userId), c.avatar))}
              {contacts.data && !contacts.data.length && <T kind="small" muted>No hay personas a quienes escribir sobre este alumno.</T>}
            </View>
          </Field>
        )}
        {!!recipientId && (
          <>
            <Field label="Asunto"><Input value={subject} onChangeText={setSubject} maxLength={120} placeholder="Ej: Retiro anticipado el viernes" /></Field>
            <Field label="Mensaje"><Input value={body} onChangeText={setBody} multiline style={{ minHeight: 110, paddingTop: 12 }} placeholder="Escribí tu mensaje…" /></Field>
            <Button title="Enviar" kind="accent" icon="send" loading={create.isPending} disabled={!subject.trim() || !body.trim()} onPress={() => create.mutate()} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
