import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { focusManager } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { queryClient, queryPersister, PERSIST_MAX_AGE } from './src/lib/queryClient';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SchoolProvider } from './src/context/SchoolContext';
import { RootNavigator, linking, navigationRef, openPath } from './src/navigation';
import { ThemeContext, palettes, ThemeMode, useTheme } from './src/theme';
import { ToastHost } from './src/ui';
import { prefs } from './src/lib/storage';
import { setRealtimeToken } from './src/lib/realtime';
import { registerPush, pushState } from './src/lib/push';
import { syncPending, watchConnectivity } from './src/lib/offlineAttendance';

// React Query vuelve a consultar al volver a primer plano (igual que al enfocar una pestaña en la web).
AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  useEffect(() => {
    prefs.get<ThemeMode>('theme', 'system').then(setModeState);
  }, []);
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    prefs.set('theme', m);
  }, []);
  const dark = mode === 'system' ? system === 'dark' : mode === 'dark';
  const value = useMemo(() => ({ colors: dark ? palettes.dark : palettes.light, dark, mode, setMode }), [dark, mode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/** Lo que arranca con la sesión: tiempo real, push (si ya estaba permitido) y asistencia pendiente. */
const SessionEffects = () => {
  const { user } = useAuth();
  useEffect(() => {
    setRealtimeToken(user?.token ?? null);
    if (!user) return;
    pushState().then((s) => {
      if (s === 'granted') registerPush();
    });
    syncPending().catch(() => {});
    const unsubscribeNet = watchConnectivity();
    // Toque en una notificación: abre la pantalla del aviso (también si la app estaba cerrada).
    const sub = Notifications.addNotificationResponseReceivedListener((r) => openPath((r.notification.request.content.data as { url?: string })?.url));
    Notifications.getLastNotificationResponseAsync().then((r) => r && openPath((r.notification.request.content.data as { url?: string })?.url));
    return () => {
      unsubscribeNet();
      sub.remove();
    };
  }, [user]);
  return null;
};

const Shell = () => {
  const { dark, colors } = useTheme();
  const navTheme = useMemo(() => ({ ...(dark ? DarkTheme : DefaultTheme), colors: { ...(dark ? DarkTheme : DefaultTheme).colors, primary: colors.primary, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border } }), [dark, colors]);
  return (
    <NavigationContainer ref={navigationRef} linking={linking} theme={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <RootNavigator />
      <SessionEffects />
      <ToastHost />
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE, buster: 'v1' }}>
          <AuthProvider>
            <SchoolProvider>
              <Shell />
            </SchoolProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
