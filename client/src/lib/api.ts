export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const SESSION_KEY = 'user';
const SCHOOL_KEY = 'sentryx.schoolId';
const LEVEL_KEY = 'sentryx.levelId';

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

/** Nivel elegido en el selector (null = todos los niveles). */
export const getLevelId = (): number | null => safe(() => Number(localStorage.getItem(LEVEL_KEY)) || null, null);
export const setLevelId = (id: number | null) =>
  safe(() => (id ? localStorage.setItem(LEVEL_KEY, String(id)) : localStorage.removeItem(LEVEL_KEY)), undefined);

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
  const levelId = getLevelId();
  if (levelId) headers['X-Level-Id'] = String(levelId);
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

export type UploadPurpose = 'MATERIAL' | 'ANNOUNCEMENT' | 'MESSAGE' | 'OTHER';
export interface UploadedFile { fileId: number; name: string; size: number; mimeType: string }

/**
 * Achica fotos grandes antes de subirlas (máx. 1600 px, JPEG 82%). Una foto de celular de 4 MB
 * queda en ~300 KB: menos datos para el docente, menos almacenamiento y descargas más rápidas para las familias.
 */
async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Sube un archivo directo al bucket (S3/R2) con URL firmada y lo confirma.
 * El servidor nunca recibe el archivo: solo registra quién lo subió, cuánto pesa y a qué aula pertenece.
 */
export async function uploadFile(
  original: File,
  opts: { purpose: UploadPurpose; divisionId?: number | null; subjectId?: number | null; onProgress?: (pct: number) => void } = { purpose: 'OTHER' }
): Promise<UploadedFile> {
  const file = await compressImage(original);
  const contentType = file.type || 'application/octet-stream';
  const { fileId, uploadUrl } = await apiSend<{ fileId: number; uploadUrl: string }>('POST', '/school/files/presign', {
    fileName: file.name,
    contentType,
    size: file.size,
    purpose: opts.purpose,
    divisionId: opts.divisionId ?? null,
    subjectId: opts.subjectId ?? null,
  });
  // XHR para poder mostrar el progreso (videos pesados).
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, 'No se pudo subir el archivo.')));
    xhr.onerror = () => reject(new ApiError(0, 'Se cortó la conexión durante la subida.'));
    xhr.send(file);
  });
  const done = await apiSend<{ id: number; name: string; size: number; mimeType: string }>('POST', `/school/files/${fileId}/confirm`);
  return { fileId: done.id, name: done.name, size: done.size, mimeType: done.mimeType };
}

export const formatBytes = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;
