import Constants from 'expo-constants';

/**
 * Configuración de la app. Las EXPO_PUBLIC_* se incrustan al compilar (ver .env.example);
 * si faltan, se usan los valores de app.json → extra (producción).
 */
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || 'https://web-production-66994.up.railway.app').replace(/\/$/, '');
export const REALTIME_URL = (process.env.EXPO_PUBLIC_REALTIME_URL || extra.realtimeUrl || API_URL).replace(/\/$/, '');
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || extra.webUrl || 'https://sentryx.wearesrv.com').replace(/\/$/, '');
/** Identifica a la app ante la API (header X-Client-Key). Sin esto la API rechaza los pedidos. */
export const CLIENT_KEY = process.env.EXPO_PUBLIC_CLIENT_KEY || extra.clientKey || '';
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
