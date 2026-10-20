import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, CornerDownLeft, GraduationCap, Users, BookOpen } from 'lucide-react';
import { useSchool } from '../school/SchoolContext';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../lib/api';
import { searchHelp, type HelpEntry } from '../school/helpIndex';
import { Entity, Action } from '../school/permissions';
import type { Paginated } from '../school/types';

interface StudentHit { id: number; firstName: string; lastName: string; Enrollments?: Array<{ Division?: { name: string } }> }
interface PersonHit { id: number; firstName: string; lastName: string; roles?: Array<{ roleLabel: string; active: boolean }> }
type Result = { kind: 'help'; entry: HelpEntry } | { kind: 'student'; s: StudentHit } | { kind: 'person'; p: PersonHit };

const useDebounced = (value: string, ms = 250) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

/**
 * Buscador global (barra superior, Ctrl+K): dónde está cada cosa (índice de ayuda) y, para el personal,
 * alumnos y personas por nombre. Enter abre el primer resultado; flechas para moverse.
 */
export const GlobalSearch = ({ compact }: { compact?: boolean }) => {
  const navigate = useNavigate();
  const { session, can } = useSchool();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q);
  const ctx = useMemo(() => ({ session, can, isSuperAdmin: !!user?.userData.isSuperAdmin }), [session, can, user]);
  const help = useMemo(() => searchHelp(ctx, q, 6), [ctx, q]);
  const canPeople = !!session && can(Entity.USERS, Action.READ);
  const students = useQuery({
    queryKey: ['search-students', dq],
    queryFn: () => apiGet<Paginated<StudentHit>>(`/school/students?q=${encodeURIComponent(dq)}&limit=4`),
    enabled: canPeople && dq.trim().length >= 2,
    staleTime: 30_000,
  });
  const people = useQuery({
    queryKey: ['search-people', dq],
    queryFn: () => apiGet<Paginated<PersonHit>>(`/school/people?q=${encodeURIComponent(dq)}&limit=4`),
    enabled: canPeople && dq.trim().length >= 2,
    staleTime: 30_000,
  });
  const results: Result[] = useMemo(
    () => [
      ...help.map((entry) => ({ kind: 'help' as const, entry })),
      ...(students.data?.data ?? []).map((s) => ({ kind: 'student' as const, s })),
      ...(people.data?.data ?? []).filter((p) => p.roles?.some((r) => r.active)).map((p) => ({ kind: 'person' as const, p })),
    ],
    [help, students.data, people.data]
  );
  useEffect(() => setActive(0), [results.length, q]);

  // Ctrl+K / Cmd+K enfoca el buscador desde cualquier pantalla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (r: Result) => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    if (r.kind === 'help') navigate(r.entry.path);
    else if (r.kind === 'student') navigate(`/alumnos/${r.s.id}`);
    else navigate(`/personas/${r.p.id}`);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
    else if (e.key === 'Enter' && results[active]) (e.preventDefault(), go(results[active]));
    else if (e.key === 'Escape') (setOpen(false), inputRef.current?.blur());
  };
  if (!session) return null;

  return (
    <div ref={boxRef} className={`gsearch ${compact ? 'gsearch-compact' : ''}`}>
      <Search size={16} className="muted gsearch-icon" />
      <input
        ref={inputRef}
        className="input gsearch-input"
        placeholder={compact ? 'Buscar…' : 'Buscar: notas, boletín, faltas, un alumno…  (Ctrl+K)'}
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="Buscar en Sentryx"
        role="combobox"
        aria-expanded={open && results.length > 0}
      />
      {open && q.trim() && (
        <div className="gsearch-menu card" role="listbox">
          {!results.length && <div className="small muted" style={{ padding: 12 }}>{students.isFetching || people.isFetching ? 'Buscando…' : 'Nada por acá. Probá con otra palabra (ej: "notas", "faltas", "boletín").'}</div>}
          {results.map((r, i) => (
            <button key={r.kind === 'help' ? `h-${r.entry.id}` : r.kind === 'student' ? `s-${r.s.id}` : `p-${r.p.id}`} type="button" role="option" aria-selected={i === active} className={`gsearch-item ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
              {r.kind === 'help' ? <BookOpen size={16} /> : r.kind === 'student' ? <GraduationCap size={16} /> : <Users size={16} />}
              <span className="grow" style={{ minWidth: 0 }}>
                {r.kind === 'help' && (
                  <>
                    <span className="gsearch-title">{r.entry.title} <span className="xs muted">· {r.entry.section}</span></span>
                    <span className="xs muted truncate" style={{ display: 'block' }}>{r.entry.description}</span>
                  </>
                )}
                {r.kind === 'student' && (
                  <>
                    <span className="gsearch-title">{r.s.lastName}, {r.s.firstName}</span>
                    <span className="xs muted" style={{ display: 'block' }}>Alumno{r.s.Enrollments?.[0]?.Division ? ` · ${r.s.Enrollments[0].Division.name}` : ''}</span>
                  </>
                )}
                {r.kind === 'person' && (
                  <>
                    <span className="gsearch-title">{r.p.lastName}, {r.p.firstName}</span>
                    <span className="xs muted" style={{ display: 'block' }}>{r.p.roles?.filter((x) => x.active).map((x) => x.roleLabel).join(' · ') || 'Persona'}</span>
                  </>
                )}
              </span>
              {i === active && <CornerDownLeft size={14} className="muted" />}
            </button>
          ))}
          <div className="xs muted" style={{ padding: '6px 12px', borderTop: '1px solid var(--border)' }}>↑↓ para moverte · Enter para abrir · <a href="/ayuda" onClick={(e) => (e.preventDefault(), setOpen(false), navigate('/ayuda'))}>Ver el índice completo</a></div>
        </div>
      )}
    </div>
  );
};
