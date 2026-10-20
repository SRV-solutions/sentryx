import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend, onUnauthorized, setApiAuth } from '../lib/api';
import { secureToken, prefs } from '../lib/storage';
import { queryClient } from '../lib/queryClient';
import { unregisterPush } from '../lib/push';
import type { StoredSession, UserData } from '../types';

interface Ctx {
  user: StoredSession | null;
  /** true mientras se restaura la sesión guardada al abrir la app. */
  restoring: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  patchUserData: (patch: Partial<UserData>) => void;
  replaceToken: (token: string) => Promise<void>;
}

const AuthCtx = createContext<Ctx>({ user: null, restoring: true, login: async () => {}, logout: async () => {}, patchUserData: () => {}, replaceToken: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<StoredSession | null>(null);
  const [restoring, setRestoring] = useState(true);

  const logout = useCallback(async () => {
    await unregisterPush().catch(() => {});
    setUser(null);
    setApiAuth({ token: null, schoolId: null, levelId: null });
    await secureToken.clear();
    await prefs.remove('userData');
    queryClient.clear();
  }, []);

  // Al abrir: si hay token guardado, se usa de inmediato (datos del usuario desde la caché) y se valida en segundo plano.
  useEffect(() => {
    (async () => {
      const token = await secureToken.get();
      const cached = await prefs.get<UserData | null>('userData', null);
      if (token && cached) {
        setApiAuth({ token });
        setUser({ token, userData: cached });
        apiGet<UserData>('/users/me')
          .then((fresh) => {
            setUser((u) => (u ? { ...u, userData: fresh } : u));
            prefs.set('userData', fresh);
          })
          .catch(() => {});
      }
      setRestoring(false);
    })();
    return onUnauthorized(() => {
      logout();
    });
  }, [logout]);

  const login = useCallback(async (identifier: string, password: string) => {
    const r = await apiSend<{ token: string; userData: UserData }>('POST', '/users/login', { email: identifier.trim(), password });
    setApiAuth({ token: r.token });
    await secureToken.set(r.token);
    await prefs.set('userData', r.userData);
    setUser({ token: r.token, userData: r.userData });
  }, []);

  const patchUserData = useCallback((patch: Partial<UserData>) => {
    setUser((u) => {
      if (!u) return u;
      const next = { ...u, userData: { ...u.userData, ...patch } };
      prefs.set('userData', next.userData);
      return next;
    });
  }, []);

  const replaceToken = useCallback(async (token: string) => {
    setApiAuth({ token });
    await secureToken.set(token);
    setUser((u) => (u ? { ...u, token } : u));
  }, []);

  const value = useMemo(() => ({ user, restoring, login, logout, patchUserData, replaceToken }), [user, restoring, login, logout, patchUserData, replaceToken]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
