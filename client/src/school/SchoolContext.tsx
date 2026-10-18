import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, getSchoolId, setSchoolId, getLevelId, setLevelId } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { SchoolSession, SchoolSummary } from './types';
import { Entity, Action, permissionKey } from './permissions';

interface Ctx {
  schools: SchoolSummary[];
  session: SchoolSession | null;
  loading: boolean;
  /** true si el usuario no pertenece a ningún colegio (o es superadmin sin colegios creados). */
  noSchool: boolean;
  /** ¿Tiene el permiso (acción sobre entidad) en el colegio activo? */
  can: (entity: Entity, action: Action) => boolean;
  switchSchool: (id: number) => void;
  /** Nivel activo (null = todos). */
  levelId: number | null;
  switchLevel: (id: number | null) => void;
}

const SchoolCtx = createContext<Ctx>({ schools: [], session: null, loading: true, noSchool: false, can: () => false, switchSchool: () => {}, levelId: null, switchLevel: () => {} });

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

  const [levelId, setLevelState] = useState<number | null>(getLevelId);
  const sessionQ = useQuery({
    queryKey: ['school-session', user?.userData.id, activeId, levelId],
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
      can: (entity, action) => perms.has(permissionKey(entity, action)),
      // El servidor confirma el nivel (si no tiene acceso a ese nivel, vuelve a "todos").
      levelId: session?.activeLevelId ?? null,
      switchLevel: (id) => {
        setLevelId(id);
        setLevelState(id);
        // Todo lo visible depende del nivel: se refresca (el caché de otras escuelas no aplica acá).
        qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'schools' });
      },
      switchSchool: (id) => {
        setSchoolId(id);
        setLevelId(null);
        setLevelState(null);
        // Todo lo cacheado pertenece a la escuela anterior.
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'schools' });
        qc.invalidateQueries();
      },
    };
  }, [schoolsQ.data, schoolsQ.isLoading, schoolsQ.isSuccess, sessionQ.data, sessionQ.isLoading, activeId, levelId, qc]);

  return <SchoolCtx.Provider value={value}>{children}</SchoolCtx.Provider>;
};

export const useSchool = () => useContext(SchoolCtx);
