import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiSend } from './api';
import { prefs } from './storage';

/**
 * Notificaciones push con el servicio de Expo. El token del dispositivo se registra en la API
 * (DeviceToken kind EXPO) y la API lo usa para avisar comunicados, mensajes y alertas.
 *
 * Nota: en Expo Go (Android) desde el SDK 53 NO llegan push remotas; en una build propia
 * (EAS development build o la app de las tiendas) sí. iOS en Expo Go sigue funcionando.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export type PushState = 'granted' | 'denied' | 'unsupported' | 'unknown';

export const pushState = async (): Promise<PushState> => {
  if (!Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'unknown';
};

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

/** Pide permiso (si hace falta), obtiene el token y lo registra en la API. Devuelve el estado final. */
export const registerPush = async (): Promise<PushState> => {
  if (!Device.isDevice) return 'unsupported';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Avisos del colegio', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200, 100, 200], lightColor: '#0B78FB' });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  try {
    const id = projectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined);
    const previous = await prefs.get<string | null>('pushToken', null);
    if (previous !== token) {
      await apiSend('POST', '/school/push/subscribe', { kind: 'EXPO', token });
      await prefs.set('pushToken', token);
    }
    return 'granted';
  } catch (err) {
    // Sin projectId de EAS (ver README) o sin servicios de Google: la app sigue funcionando sin push.
    console.warn('[push] no se pudo registrar:', (err as Error).message);
    return 'unsupported';
  }
};

/** Al cerrar sesión: el token deja de pertenecer a esta persona. */
export const unregisterPush = async () => {
  const token = await prefs.get<string | null>('pushToken', null);
  if (!token) return;
  await apiSend('POST', '/school/push/unsubscribe', { endpoint: token }).catch(() => {});
  await prefs.remove('pushToken');
};
