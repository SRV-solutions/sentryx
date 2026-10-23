import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, getSession, setSession, setSchoolId, onUnauthorized, StoredSession } from '../lib/api';

export interface AuthValue {
  user: StoredSession | null;
  /** Equipo de Sentryx: consola de la plataforma (colegios y facturación de todos). */
  isSuperAdmin: boolean;
  login: (identifier: string, password: string) => Promise<StoredSession>;
  logout: () => void;
  /** Entra con el link de un solo uso del QR "Llevar Sentryx al celular". */
  loginWithLink: (token: string) => Promise<StoredSession>;
  patchUserData: (patch: Partial<StoredSession['userData']>) => void;
  /** Reemplaza el token (al cambiar la contraseña la API cierra las otras sesiones y entrega uno nuevo). */
  replaceToken: (token: string) => void;
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

  const isSuperAdmin = !!user?.userData?.isSuperAdmin;

  const logout = useCallback(() => {
    // Avisa al servidor para que esta sesión deje de servir (si no hay red, igual se borra el token local).
    const s = getSession();
    if (s?.token) fetch(`${API_URL}/users/logout`, { method: 'POST', headers: { Authorization: `Bearer ${s.token}` }, keepalive: true }).catch(() => {});
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

  const loginWithLink = async (token: string): Promise<StoredSession> => {
    const res = await fetch(`${API_URL}/users/login-link/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
    if (!res) throw new Error('Sin conexión. Revisá tu internet.');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'No se pudo entrar con el código.');
    setSession(data);
    setUser(data);
    return data;
  };

  /** Actualiza datos locales del usuario (ej: luego de cambiar la contraseña obligatoria). */
  const replaceToken = (token: string) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, token };
      setSession(next);
      return next;
    });
  };

  const patchUserData = (patch: Partial<StoredSession['userData']>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, userData: { ...prev.userData, ...patch } };
      setSession(next);
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isSuperAdmin, patchUserData, replaceToken, loginWithLink }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
