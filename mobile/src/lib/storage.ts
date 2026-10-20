import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Qué se guarda dónde:
 *  - el token de sesión, en el almacén seguro del sistema (Keychain en iOS, Keystore en Android);
 *  - preferencias y caché, en AsyncStorage (sin cifrar: no hay nada sensible ahí).
 */
const TOKEN_KEY = 'sentryx.token';

export const secureToken = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY).catch(() => null),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
};

export const prefs = {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await AsyncStorage.getItem(`sentryx.${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set: (key: string, value: unknown) => AsyncStorage.setItem(`sentryx.${key}`, JSON.stringify(value)).catch(() => {}),
  remove: (key: string) => AsyncStorage.removeItem(`sentryx.${key}`).catch(() => {}),
};
