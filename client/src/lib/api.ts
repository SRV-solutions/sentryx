export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const SESSION_KEY = 'user';
const SCHOOL_KEY = 'sentryx.schoolId';

export interface StoredSession {
  token: string;
  userData: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    dni?: string | null;
    username: string;
    avatar?: string | null;
    roleName?: string;
    mustChangePassword?: boolean;
    permissions?: Array<{ entity: string; action: string }>;
    [k: string]: unknown;
  };
}

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const getSession = (): StoredSession | null => safe(() => JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'), null);
export const setSession = (s: StoredSession | null) =>
  safe(() => (s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY)), undefined);

export const getSchoolId = (): number | null => safe(() => Number(localStorage.getItem(SCHOOL_KEY)) || null, null);
export const setSchoolId = (id: number | null) =>
  safe(() => (id ? localStorage.setItem(SCHOOL_KEY, String(id)) : localStorage.removeItem(SCHOOL_KEY)), undefined);

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Se dispara ante un 401 (sesión vencida): el AuthProvider cierra sesión. Un 403 NO desloguea. */
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
};

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const session = getSession();
  const schoolId = getSchoolId();
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  if (schoolId) headers['X-School-Id'] = String(schoolId);
  let body = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, 'Sin conexión. Revisá tu internet e intentá de nuevo.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && session) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(res.status, data?.message ?? data?.error ?? 'Ocurrió un error.', data?.details);
  }
  return data as T;
}

export const apiGet = <T,>(path: string) => api<T>(path);
export const apiSend = <T,>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, json?: unknown) => api<T>(path, { method, json });

/** Sube un archivo directo a S3 con URL firmada (el servidor nunca recibe el archivo). */
export async function uploadAttachment(file: File) {
  const { key, url } = await apiSend<{ key: string; url: string }>('POST', '/school/uploads/presign', {
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  });
  const put = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
  if (!put.ok) throw new ApiError(put.status, 'No se pudo subir el archivo.');
  return { name: file.name, key, size: file.size, type: file.type };
}
