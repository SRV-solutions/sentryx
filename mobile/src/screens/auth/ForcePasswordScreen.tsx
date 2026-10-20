import { useState } from 'react';
import { KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiSend } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Alert, Button, Field, Input, Screen, T, keyboardBehavior, toast } from '../../ui';

const problem = (next: string, confirm: string, current: string) => {
  if (next.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.';
  if (next === current) return 'La nueva contraseña tiene que ser distinta de la temporal.';
  if (next !== confirm) return 'Las contraseñas no coinciden.';
  return null;
};

/** Primer ingreso: hay que reemplazar la contraseña temporal por una propia. */
export default function ForcePasswordScreen() {
  const { patchUserData, replaceToken, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const p = problem(next, confirm, current);
    if (p) return setError(p);
    setError('');
    setBusy(true);
    try {
      const r = await apiSend<{ token?: string }>('PUT', '/users/change-password', { currentPassword: current, newPassword: next });
      if (r?.token) await replaceToken(r.token);
      patchUserData({ mustChangePassword: false });
      toast('Contraseña actualizada');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardBehavior}>
      <Screen>
        <T kind="h1" style={{ marginTop: insets.top + 24 }}>Elegí tu contraseña</T>
        <T kind="small" muted>Es tu primer ingreso: reemplazá la contraseña temporal por una propia (mínimo 8 caracteres).</T>
        <Field label="Contraseña temporal"><Input value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" textContentType="password" /></Field>
        <Field label="Nueva contraseña"><Input value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" textContentType="newPassword" /></Field>
        <Field label="Repetila"><Input value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" textContentType="newPassword" onSubmitEditing={submit} /></Field>
        {!!confirm && confirm !== next && <T kind="xs" color="#D5303E">Las contraseñas no coinciden.</T>}
        {!!error && <Alert tone="danger" icon="alert-circle">{error}</Alert>}
        <Button title="Guardar y entrar" kind="accent" onPress={submit} loading={busy} disabled={!current || !next || !confirm} />
        <Button title="Cerrar sesión" kind="ghost" onPress={logout} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
