import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, setApiAuth } from '../lib/api';
import { prefs } from '../lib/storage';
import { useAuth } from './AuthContext';
import type { PermissionKey, SchoolSession, SchoolSummary } from '../types';

interface Ctx {
  schools: SchoolSummary[];
  schoolId: number | null;
  session: SchoolSession | null;
  loading: boolean;
  noSchool: boolean;
  can: (permission: PermissionKey) => boolean;
  switchSchool: (id: number) => void;
}

const SchoolCtx = createContext<Ctx>({ schools: [], schoolId: null, session: null, loading: true, noSchool: false, can: () => false, switchSchool: () => {} });

/** Colegio activo y lo que la persona es y puede hacer en él (la API decide; acá solo se muestra u oculta). */
export const SchoolProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [schoolId, setSchoolIdState] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    prefs.get<number | null>('schoolId', null).then((saved) => {
      setSchoolIdState(saved);
      setApiAuth({ schoolId: saved });
      setReady(true);
    });
  }, []);

  const schoolsQ = useQuery({
    queryKey: ['schools', user?.userData.id],
    queryFn: () => apiGet<SchoolSummary[]>('/school/schools'),
    enabled: !!user && ready,
    staleTime: 10 * 60_000,
  });

  // Colegio activo: el guardado si sigue siendo válido; si no, el primero.
  useEffect(() => {
    const list = schoolsQ.data;
    if (!list?.length) return;
    if (!schoolId || !list.some((s) => s.id === schoolId)) {
      setSchoolIdState(list[0].id);
      setApiAuth({ schoolId: list[0].id });
      prefs.set('schoolId', list[0].id);
    }
  }, [schoolsQ.data, schoolId]);

  const activeId = schoolsQ.data?.length ? (schoolId && schoolsQ.data.some((s) => s.id === schoolId) ? schoolId : schoolsQ.data[0].id) : null;

  const sessionQ = useQuery({
    queryKey: ['school-session', user?.userData.id, activeId],
    queryFn: () => apiGet<SchoolSession>('/school/session'),
    enabled: !!user && !!activeId,
    staleTime: 5 * 60_000,
  });

  const switchSchool = useCallback(
    (id: number) => {
      setSchoolIdState(id);
      setApiAuth({ schoolId: id });
      prefs.set('schoolId', id);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'schools' });
    },
    [qc]
  );

  const value = useMemo<Ctx>(() => {
    const session = sessionQ.data ?? null;
    const perms = new Set(session?.permissions ?? []);
    return {
      schools: schoolsQ.data ?? [],
      schoolId: activeId,
      session,
      loading: !ready || schoolsQ.isLoading || (!!activeId && sessionQ.isLoading && !session),
      noSchool: schoolsQ.isSuccess && schoolsQ.data.length === 0,
      can: (p) => perms.has(p),
      switchSchool,
    };
  }, [ready, schoolsQ.data, schoolsQ.isLoading, schoolsQ.isSuccess, sessionQ.data, sessionQ.isLoading, activeId, switchSchool]);

  return <SchoolCtx.Provider value={value}>{children}</SchoolCtx.Provider>;
};

export const useSchool = () => useContext(SchoolCtx);
