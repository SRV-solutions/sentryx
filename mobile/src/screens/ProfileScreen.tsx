import { useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { apiSend } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../context/SchoolContext';
import { Alert, Avatar, Button, Card, Divider, Field, Input, Row, Screen, T, keyboardBehavior, toast } from '../ui';

export default function ProfileScreen() {
  const { user, replaceToken } = useAuth();
  const { session } = useSchool();
  const u = user!.userData;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = async () => {
    if (next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (next !== confirm) return setError('Las contraseñas no coinciden.');
    setError('');
    setBusy(true);
    try {
      const r = await apiSend<{ token?: string }>('PUT', '/users/change-password', { currentPassword: current, newPassword: next });
      if (r?.token) await replaceToken(r.token);
      setCurrent(''); setNext(''); setConfirm('');
      toast('Contraseña actualizada ✅');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardBehavior} keyboardVerticalOffset={90}>
      <Screen>
        <Card>
          <Row>
            <Avatar name={`${u.firstName} ${u.lastName}`} uri={u.avatar} size={60} />
            <View style={{ flex: 1 }}>
              <T kind="h2">{u.firstName} {u.lastName}</T>
              <T kind="small" muted>{u.email}</T>
              {!!u.dni && <T kind="small" muted>DNI {u.dni}</T>}
            </View>
          </Row>
          <Divider />
          <T kind="small" muted style={{ marginTop: 10 }}>{session?.school.name} · {session?.roleLabels.join(' · ')}</T>
          <T kind="xs" muted>Para cambiar tus datos o la foto, escribile a la secretaría de tu colegio o hacelo desde la web.</T>
        </Card>

        <T kind="h2">Cambiar contraseña</T>
        <Field label="Contraseña actual"><Input value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" textContentType="password" /></Field>
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres."><Input value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" textContentType="newPassword" /></Field>
        <Field label="Repetila"><Input value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" textContentType="newPassword" onSubmitEditing={change} /></Field>
        {!!error && <Alert tone="danger" icon="alert-circle">{error}</Alert>}
        <Button title="Guardar nueva contraseña" loading={busy} disabled={!current || !next || !confirm} onPress={change} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
