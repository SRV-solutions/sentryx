import NetInfo from '@react-native-community/netinfo';
import { apiSend, ApiError, getApiSchoolId } from './api';
import { prefs } from './storage';
import type { AttendanceStatus } from '../types';

/**
 * Asistencia sin señal: si al guardar no hay conexión, el pase de lista queda en el celular y se
 * envía solo cuando vuelve la red (o al abrir la app). Si para la misma división y día se guardó dos
 * veces, vale la última.
 */
export interface PendingAttendance {
  schoolId: number;
  divisionId: number;
  divisionName: string;
  date: string;
  records: Array<{ studentId: number; status: AttendanceStatus; justified: boolean }>;
  savedAt: string;
}

const KEY = 'pendingAttendance';
const subscribers = new Set<(items: PendingAttendance[]) => void>();
let syncing = false;

export const getPending = () => prefs.get<PendingAttendance[]>(KEY, []);

const notify = (items: PendingAttendance[]) => subscribers.forEach((fn) => fn(items));

export const subscribePending = (fn: (items: PendingAttendance[]) => void) => {
  subscribers.add(fn);
  getPending().then(fn);
  return () => {
    subscribers.delete(fn);
  };
};

export const queueAttendance = async (item: Omit<PendingAttendance, 'savedAt' | 'schoolId'>) => {
  const schoolId = getApiSchoolId();
  if (!schoolId) return;
  const items = (await getPending()).filter((p) => !(p.schoolId === schoolId && p.divisionId === item.divisionId && p.date === item.date));
  items.push({ ...item, schoolId, savedAt: new Date().toISOString() });
  await prefs.set(KEY, items);
  notify(items);
};

/** Envía lo pendiente del colegio activo. Devuelve cuántos se enviaron. */
export const syncPending = async (): Promise<number> => {
  if (syncing) return 0;
  const schoolId = getApiSchoolId();
  if (!schoolId) return 0;
  syncing = true;
  let sent = 0;
  try {
    const items = await getPending();
    const remaining: PendingAttendance[] = [];
    for (const item of items) {
      if (item.schoolId !== schoolId) {
        remaining.push(item);
        continue;
      }
      try {
        await apiSend('PUT', `/school/attendance/division/${item.divisionId}`, { date: item.date, records: item.records });
        sent++;
      } catch (err) {
        // Sin red: queda para después. Otro error (ej: ya no tiene permiso): se descarta para no reintentar por siempre.
        if (err instanceof ApiError && err.isNetwork) remaining.push(item);
      }
    }
    await prefs.set(KEY, remaining);
    notify(remaining);
  } finally {
    syncing = false;
  }
  return sent;
};

/** Reintenta cuando vuelve la conexión. Llamar una vez al iniciar la app. */
export const watchConnectivity = () =>
  NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) syncPending().catch(() => {});
  });
