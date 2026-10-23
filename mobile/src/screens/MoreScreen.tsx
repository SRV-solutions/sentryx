import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../context/SchoolContext';
import { useTheme, radius, ThemeMode } from '../theme';
import { Avatar, Card, Chip, Row, Screen, Sheet, T, toast } from '../ui';
import { apiSend } from '../lib/api';
import { pushState, registerPush, unregisterPush, PushState } from '../lib/push';
import { WEB_URL, APP_VERSION } from '../config';
import { Perm } from '../types';
import type { RootStackParamList } from '../navigation';

const Item = ({ icon, label, detail, onPress, right, danger }: { icon: keyof typeof Feather.glyphMap; label: string; detail?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean }) => {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} android_ripple={{ color: colors.surface2 }} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 52 }, pressed && { backgroundColor: colors.surface2 }]}>
      <Feather name={icon} size={20} color={danger ? colors.danger : colors.primary} />
      <View style={{ flex: 1 }}>
        <T color={danger ? colors.danger : undefined}>{label}</T>
        {detail && <T kind="xs" muted>{detail}</T>}
      </View>
      {right ?? (onPress ? <Feather name="chevron-right" size={18} color={colors.text3} /> : null)}
    </Pressable>
  );
};

const Group = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <View style={{ gap: 6 }}>
    {title && <T kind="xs" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4 }}>{title}</T>}
    <Card style={{ padding: 0, overflow: 'hidden' }}>{children}</Card>
  </View>
);

/** Pestaña "Más": perfil, colegio, notificaciones, apariencia, accesos a la web y salir. */
export default function MoreScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useAuth();
  const { schools, session, switchSchool, can } = useSchool();
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [push, setPush] = useState<PushState>('unknown');
  const [pickSchool, setPickSchool] = useState(false);
  useEffect(() => {
    pushState().then(setPush);
  }, []);
  const u = user!.userData;
  const isAdmin = !!session?.isStaff && (can(Perm.USERS_READ) || can(Perm.ANNOUNCEMENTS_CREATE));

  const togglePush = async (on: boolean) => {
    if (on) {
      const s = await registerPush();
      setPush(s);
      if (s === 'denied') toast('Las notificaciones están bloqueadas: activalas desde Ajustes del teléfono.', true);
      if (s === 'unsupported') toast('Las notificaciones push no funcionan en este dispositivo/app.', true);
    } else {
      await unregisterPush();
      setPush('unknown');
    }
  };

  return (
    <Screen>
      <T kind="h1" style={{ marginTop: insets.top + 8 }}>Más</T>
      <Card onPress={() => nav.navigate('Profile')}>
        <Row>
          <Avatar name={`${u.firstName} ${u.lastName}`} uri={u.avatar} size={48} />
          <View style={{ flex: 1 }}>
            <T kind="h3">{u.firstName} {u.lastName}</T>
            <T kind="small" muted numberOfLines={1}>{session?.roleLabels.join(' · ')}</T>
          </View>
          <Feather name="chevron-right" size={18} color={colors.text3} />
        </Row>
      </Card>

      <Group title="Colegio">
        <Item icon="home" label={session?.school.name ?? ''} detail={schools.length > 1 ? 'Tocá para cambiar de colegio' : undefined} onPress={schools.length > 1 ? () => setPickSchool(true) : undefined} />
      </Group>

      <Group title="Notificaciones">
        <Item icon="bell" label="Notificaciones" detail="Historial de avisos" onPress={() => nav.navigate('Notifications')} />
        <Item
          icon="smartphone"
          label="Avisos en el celular"
          detail={push === 'granted' ? 'Activados' : push === 'denied' ? 'Bloqueados en Ajustes' : push === 'unsupported' ? 'No disponible en este dispositivo' : 'Desactivados'}
          right={<Switch value={push === 'granted'} onValueChange={togglePush} trackColor={{ true: colors.primary }} disabled={push === 'unsupported'} />}
        />
        {push === 'denied' && <Item icon="settings" label="Abrir Ajustes del teléfono" onPress={() => Linking.openSettings()} />}
      </Group>

      <Group title="Apariencia">
        <View style={{ padding: 12 }}>
          <Row style={{ gap: 8 }}>
            {([['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']] as Array<[ThemeMode, string]>).map(([m, label]) => <Chip key={m} label={label} active={mode === m} onPress={() => setMode(m)} />)}
          </Row>
        </View>
      </Group>

      <Group title="En la web">
        {isAdmin && <Item icon="layout" label="Administración del colegio" detail="Alumnos, notas, comunicados, planes…" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/inicio`)} />}
        <Item icon="help-circle" label="Ayuda y soporte" detail="Reportar un problema" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/inicio?reportar=1`)} />
        <Item icon="globe" label="Abrir Sentryx en el navegador" onPress={() => Linking.openURL(WEB_URL)} />
      </Group>

      <Group title="Seguridad">
        <Item icon="smartphone" label="Cerrar sesión en los otros dispositivos" detail="Si prestaste o perdiste otro celular, o entraste en una PC ajena" onPress={() => apiSend<{ closed: number }>('POST', '/users/sessions/logout-others').then((r) => toast(r.closed ? `Sesión cerrada en ${r.closed} ${r.closed === 1 ? 'dispositivo' : 'dispositivos'}` : 'No había otras sesiones abiertas')).catch((e: Error) => toast(e.message, true))} />
        <Item icon="log-out" label="Cerrar sesión" danger onPress={logout} />
      </Group>
      <T kind="xs" muted style={{ textAlign: 'center' }}>Sentryx {APP_VERSION} · {Platform.OS === 'ios' ? 'iOS' : 'Android'} · por SRV</T>

      <Sheet open={pickSchool} onClose={() => setPickSchool(false)} title="Cambiar de colegio">
        {schools.map((s) => (
          <Pressable key={s.id} onPress={() => (switchSchool(s.id), setPickSchool(false))} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: s.id === session?.school.id ? colors.primary : colors.border }, pressed && { opacity: 0.8 }]}>
            <Avatar name={s.name} uri={s.logoUrl} size={36} />
            <T style={{ flex: 1 }}>{s.name}</T>
            {s.id === session?.school.id && <Feather name="check" size={18} color={colors.primary} />}
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}
