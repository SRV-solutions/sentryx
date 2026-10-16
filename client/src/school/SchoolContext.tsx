import { createContext, useContext, useEffect, useMemo, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, getSchoolId, setSchoolId } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Permission, SchoolSession, SchoolSummary } from './types';

interface Ctx {
  schools: SchoolSummary[];
  session: SchoolSession | null;
  loading: boolean;
  /** true si el usuario no pertenece a ninguna escuela (alumno de cursos SRV). */
  noSchool: boolean;
  can: (p: Permission) => boolean;
  switchSchool: (id: number) => void;
}

const SchoolCtx = createContext<Ctx>({ schools: [], session: null, loading: true, noSchool: false, can: () => false, switchSchool: () => {} });

export const SchoolProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth() as { user: { token: string; userData: { id: number } } | null };
  const qc = useQueryClient();

  const schoolsQ = useQuery({
    queryKey: ['schools', user?.userData.id],
    queryFn: () => apiGet<SchoolSummary[]>('/school/schools'),
    enabled: !!user,
    staleTime: 10 * 60_000,
  });

  // Escuela activa: la guardada si sigue siendo válida, si no la primera.
  useEffect(() => {
    const list = schoolsQ.data;
    if (!list?.length) return;
    const saved = getSchoolId();
    if (!saved || !list.some((s) => s.id === saved)) setSchoolId(list[0].id);
  }, [schoolsQ.data]);

  const activeId = schoolsQ.data?.length ? (getSchoolId() ?? schoolsQ.data[0].id) : null;

  const sessionQ = useQuery({
    queryKey: ['school-session', user?.userData.id, activeId],
    queryFn: () => apiGet<SchoolSession>('/school/session'),
    enabled: !!user && !!activeId,
    staleTime: 5 * 60_000,
  });

  const value = useMemo<Ctx>(() => {
    const session = sessionQ.data ?? null;
    const perms = new Set(session?.permissions ?? []);
    return {
      schools: schoolsQ.data ?? [],
      session,
      loading: schoolsQ.isLoading || (!!activeId && sessionQ.isLoading),
      noSchool: schoolsQ.isSuccess && schoolsQ.data.length === 0,
      can: (p) => perms.has(p),
      switchSchool: (id) => {
        setSchoolId(id);
        // Todo lo cacheado pertenece a la escuela anterior.
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'schools' });
        qc.invalidateQueries();
      },
    };
  }, [schoolsQ.data, schoolsQ.isLoading, schoolsQ.isSuccess, sessionQ.data, sessionQ.isLoading, activeId, qc]);

  return <SchoolCtx.Provider value={value}>{children}</SchoolCtx.Provider>;
};

export const useSchool = () => useContext(SchoolCtx);
