import { apiGet, apiSend } from './api';

const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iOS solo permite push si la web está instalada en la pantalla de inicio (PWA). */
export const isIOSNotInstalled = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone);

export const pushState = (): 'unsupported' | 'granted' | 'denied' | 'default' =>
  pushSupported() ? (Notification.permission as 'granted' | 'denied' | 'default') : 'unsupported';

export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const { publicKey } = await apiGet<{ publicKey: string | null }>('/school/push/public-key');
  if (!publicKey) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const json = sub.toJSON();
  await apiSend('POST', '/school/push/subscribe', { kind: 'WEBPUSH', endpoint: json.endpoint, keys: json.keys });
  return true;
}

/** Re-registra la suscripción existente (por si cambió de usuario en el mismo dispositivo). */
export async function syncPush() {
  if (pushState() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const json = sub.toJSON();
      await apiSend('POST', '/school/push/subscribe', { kind: 'WEBPUSH', endpoint: json.endpoint, keys: json.keys });
    }
  } catch {
    /* silencioso */
  }
}
