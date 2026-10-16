import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, getSession, setSession, setSchoolId, onUnauthorized, StoredSession } from '../lib/api';

export interface AuthValue {
  user: StoredSession | null;
  isAdmin: boolean;
  login: (identifier: string, password: string) => Promise<StoredSession>;
  logout: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<Response | null>;
  updateUserData: (data: object) => Promise<unknown>;
  patchUserData: (patch: Partial<StoredSession['userData']>) => void;
  hasPermission: (entity: string, action: string) => boolean;
}

const AuthContext = createContext<AuthValue>(null as unknown as AuthValue);

const isTokenExpired = (token: string) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
};

const initialUser = () => {
  const s = getSession();
  return s?.token && !isTokenExpired(s.token) ? s : null;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<StoredSession | null>(initialUser);

  const isAdmin = user?.userData?.roleName === 'admin';

  const logout = useCallback(() => {
    setSession(null);
    setSchoolId(null);
    setUser(null);
  }, []);

  // Sesión vencida en cualquier request → login.
  useEffect(() => {
    const off = onUnauthorized(() => {
      logout();
      navigate('/login', { replace: true });
    });
    return () => {
      off();
    };
  }, [logout, navigate]);

  const login = async (identifier: string, password: string): Promise<StoredSession> => {
    const res = await fetch(`${API_URL}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: identifier, password }),
    }).catch(() => null);
    if (!res) throw new Error('Sin conexión. Revisá tu internet.');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Error al iniciar sesión');
    setSession(data);
    setUser(data);
    return data;
  };

  /** Actualiza datos locales del usuario (ej: luego de cambiar la contraseña obligatoria). */
  const patchUserData = (patch: Partial<StoredSession['userData']>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, userData: { ...prev.userData, ...patch } };
      setSession(next);
      return next;
    });
  };

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = user?.token;
    if (!token) {
      logout();
      return null;
    }
    const isFormData = options.body instanceof FormData;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...((options.headers as Record<string, string>) || {}),
        Authorization: `Bearer ${token}`,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
    });
    // Solo 401 cierra la sesión. Antes un 403 (falta de permiso) también deslogueaba al usuario.
    if (res.status === 401) {
      logout();
      navigate('/login', { replace: true });
      return null;
    }
    return res;
  };

  const updateUserData = async (newData: object) => {
    const res = await authFetch(`${API_URL}/users/me`, { method: 'PATCH', body: JSON.stringify(newData) });
    if (!res || !res.ok) return { message: 'Error al actualizar el usuario', response: res, type: 'error' };
    const updated = await res.json();
    const next = { ...user!, userData: updated };
    setSession(next);
    setUser(next);
  };

  const hasPermission = (entity: string, action: string) => !!user?.userData?.permissions?.some((p) => p.entity === entity && p.action === action);

  return (
    <AuthContext.Provider value={{ user, login, logout, authFetch, isAdmin, updateUserData, patchUserData, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
