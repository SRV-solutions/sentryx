import { API_URL, CLIENT_KEY, APP_VERSION } from '../config';

/**
 * Cliente de la API. Igual que en la web, pero:
 *  - la app se identifica con X-Client-Key (no hay Origin en un celular);
 *  - cada pedido tiene un tiempo máximo (redes escolares lentas no dejan la pantalla colgada);
 *  - los errores de red se distinguen de los del servidor, para poder guardar y reintentar.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
  /** Sin conexión o tiempo agotado: vale la pena reintentar más tarde. */
  get isNetwork() {
    return this.status === 0;
  }
}

let token: string | null = null;
let schoolId: number | null = null;
let levelId: number | null = null;
const unauthorizedListeners = new Set<() => void>();
let tokenRenewedHandler: ((token: string) => void) | null = null;
/** Sesión deslizante: cuando la API manda un token renovado, el AuthContext lo guarda. */
export const onTokenRenewed = (fn: ((token: string) => void) | null) => {
  tokenRenewedHandler = fn;
};

export const setApiAuth = (next: { token?: string | null; schoolId?: number | null; levelId?: number | null }) => {
  if (next.token !== undefined) token = next.token;
  if (next.schoolId !== undefined) schoolId = next.schoolId;
  if (next.levelId !== undefined) levelId = next.levelId;
};
export const getApiSchoolId = () => schoolId;
/** Se dispara ante un 401 (sesión vencida o cerrada en otro lado). */
export const onUnauthorized = (fn: () => void) => {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
};

const TIMEOUT_MS = 15_000;

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Client-Key': CLIENT_KEY,
    'X-App-Version': APP_VERSION,
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (schoolId) headers['X-School-Id'] = String(schoolId);
  if (levelId) headers['X-Level-Id'] = String(levelId);
  let body = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, body, signal: controller.signal });
  } catch {
    throw new ApiError(0, 'Sin conexión. Revisá el wifi o los datos e intentá de nuevo.');
  } finally {
    clearTimeout(timer);
  }

  const renewed = res.headers.get('X-Session-Token') ?? res.headers.get('x-session-token');
  if (renewed && token && renewed !== token) {
    token = renewed;
    tokenRenewedHandler?.(renewed);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(res.status, data?.message ?? data?.error ?? 'Ocurrió un error.', data?.details);
  }
  return data as T;
}

export const apiGet = <T,>(path: string) => api<T>(path);
export const apiSend = <T,>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, json?: unknown) => api<T>(path, { method, json });

/** Foto de perfil: las URLs de avatar son relativas a la API. */
export const avatarUri = (avatar?: string | null) => (avatar ? (avatar.startsWith('http') ? avatar : `${API_URL}${avatar}`) : null);
