import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme';
import { Alert, Button, Field, Input, Screen, T, keyboardBehavior } from '../../ui';
import { WEB_URL, CLIENT_KEY } from '../../config';

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await login(identifier, password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardBehavior}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: insets.top + 48, marginBottom: 24, gap: 6 }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
            <T kind="h1" color="#0B78FB" style={{ fontSize: 40, lineHeight: 48 }}>S<T kind="h1" color="#F6950A" style={{ fontSize: 40, lineHeight: 48 }}>.</T></T>
          </View>
          <T kind="h1">Sentryx<T kind="h1" color={colors.accent}>.</T></T>
          <T kind="small" muted>Ingresá con el usuario que te dio tu colegio.</T>
        </View>
        {!CLIENT_KEY && <Alert tone="warn" icon="alert-triangle">Falta configurar la clave de la app (EXPO_PUBLIC_CLIENT_KEY). Ver mobile/README.md.</Alert>}
        <Field label="Email o DNI">
          <Input value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="username" placeholder="tu@email.com o 30123456" returnKeyType="next" />
        </Field>
        <Field label="Contraseña">
          <View>
            <Input value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password" returnKeyType="go" onSubmitEditing={submit} style={{ paddingRight: 48 }} />
            <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityLabel={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={{ position: 'absolute', right: 12, top: 12 }}>
              <Feather name={show ? 'eye-off' : 'eye'} size={22} color={colors.text3} />
            </Pressable>
          </View>
        </Field>
        {!!error && <Alert tone="danger" icon="alert-circle">{error}</Alert>}
        <Button title="Ingresar" kind="accent" onPress={submit} loading={busy} disabled={!identifier.trim() || !password} />
        <Pressable onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/forgot-password`)} style={{ alignSelf: 'center', padding: 8 }}>
          <T kind="small" color={colors.primary}>¿Olvidaste tu contraseña?</T>
        </Pressable>
        <T kind="xs" muted style={{ textAlign: 'center', marginTop: 24 }}>¿No tenés usuario? Pedíselo a la secretaría de tu colegio.{'\n'}Sentryx · por SRV</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
