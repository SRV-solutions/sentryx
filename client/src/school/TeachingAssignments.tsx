/**
 * Asignar docentes a materias y cursos (Materias → Asignar docentes, Estructura, y Personal → Editar → Materias).
 * Lo hace quien configura la institución, o la conducción de un nivel en su nivel. Si la persona no es
 * docente (ej: la Rectora que además da clases), se le suma el rol Docente al asignarle la materia.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { apiGet, apiSend } from '../lib/api';
import { useSchool } from './SchoolContext';
import { Entity, Action } from './permissions';
import { Card, Chips, Empty, Skeleton, useToast } from '../ui';
import type { Structure } from './types';
import { subjectsForDivision } from './SubjectsEditor';

interface StaffLite { userId: number; role: string; active: boolean; User: { firstName: string; lastName: string } }
interface Person { userId: number; name: string; docente: boolean }

/** Niveles donde quien mira puede asignar docentes. */
export const useAssignableLevels = () => {
  const { can, session } = useSchool();
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 60_000 });
  const all = can(Entity.SCHOOL, Action.UPDATE);
  const levels = (structure.data?.levels ?? []).filter((l) => all || session?.courseLevelIds?.includes(l.id));
  return { structure, levels, canAssign: all || !!session?.courseLevelIds?.length };
};

const useAssign = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => ['structure', 'my-subjects', 'staff', 'person', 'staff-records', 'person-schedule'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const assign = useMutation({
    mutationFn: (b: { divisionId: number; subjectId: number; teacherId: number; name: string }) =>
      apiSend<{ addedDocente: boolean; alreadyAssigned: boolean }>('POST', '/school/assignments', { divisionId: b.divisionId, subjectId: b.subjectId, teacherId: b.teacherId }),
    onSuccess: (r, b) => (refresh(), toast(r.alreadyAssigned ? `${b.name} ya tenía esa materia.` : r.addedDocente ? `Listo: ${b.name} ahora también tiene el rol Docente.` : 'Docente asignado/a')),
    onError: (e: Error) => toast(e.message, true),
  });
  const unassign = useMutation({
    mutationFn: (id: number) => apiSend('DELETE', `/school/assignments/${id}`),
    onSuccess: () => (refresh(), toast('Se quitó la materia')),
    onError: (e: Error) => toast(e.message, true),
  });
  return { assign, unassign };
};

/** Personal del colegio: primero docentes, después el resto (al asignarle una materia se le suma Docente). */
const usePeople = () => {
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => apiGet<StaffLite[]>('/school/staff') });
  return useMemo(() => {
    const map = new Map<number, Person>();
    for (const m of staff.data ?? []) {
      if (!m.active) continue;
      const p = map.get(m.userId) ?? { userId: m.userId, name: `${m.User.lastName}, ${m.User.firstName}`, docente: false };
      if (m.role === 'DOCENTE') p.docente = true;
      map.set(m.userId, p);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [staff.data]);
};

const TeacherSelect = ({ people, exclude, onPick }: { people: Person[]; exclude: number[]; onPick: (p: Person) => void }) => {
  const available = people.filter((p) => !exclude.includes(p.userId));
  return (
    <select className="select" style={{ width: 220, minHeight: 34, padding: '4px 10px', fontSize: 14 }} value="" onChange={(e) => {
      const p = people.find((x) => x.userId === Number(e.target.value));
      if (p) onPick(p);
    }}>
      <option value="">+ Asignar docente</option>
      <optgroup label="Docentes">{available.filter((p) => p.docente).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</optgroup>
      <optgroup label="Otro personal (se le suma el rol Docente)">{available.filter((p) => !p.docente).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</optgroup>
    </select>
  );
};

/** Curso por curso, todas las materias del nivel con sus docentes. */
export const AssignmentsByDivision = () => {
  const { structure, levels } = useAssignableLevels();
  const people = usePeople();
  const { assign, unassign } = useAssign();
  const [levelId, setLevelId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const level = levels.find((l) => l.id === (levelId ?? levels[0]?.id));
  if (structure.isLoading) return <Skeleton count={3} h={90} />;
  if (!level) return <Empty title="No tenés niveles para asignar docentes" />;
  const term = q.trim().toLowerCase();
  const divisions = structure.data!.divisions.filter((d) => d.levelId === level.id && (!term || d.name.toLowerCase().includes(term)));
  const subjects = structure.data!.subjects.filter((x) => x.levelId === level.id);
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 8 }}>
        {levels.length > 1 && <Chips value={level.id} onChange={setLevelId} items={levels.map((l) => ({ value: l.id, label: l.name }))} />}
        <input className="input" style={{ flex: '1 1 180px', maxWidth: 260 }} placeholder="Buscar curso" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!subjects.length && <p className="small muted">{level.name} todavía no tiene materias: se crean en Administración → Estructura.</p>}
      {divisions.map((d) => {
        const own = subjectsForDivision(subjects, d);
        const missing = own.filter((sub) => !d.TeachingAssignments?.some((a) => a.subjectId === sub.id)).length;
        return (
          <Card key={d.id}>
            <div className="stack" style={{ gap: 8 }}>
              <div className="row-between">
                <b>{d.name}</b>
                <span className={`badge ${missing ? 'badge-warn' : 'badge-ok'}`}>{missing ? `${missing} sin docente` : 'Completo'}</span>
              </div>
              {!own.length && <span className="small muted">Este curso todavía no tiene materias de su año: se crean en Administración → Estructura.</span>}
              {own.map((sub) => {
                const as = d.TeachingAssignments?.filter((a) => a.subjectId === sub.id) ?? [];
                return (
                  <div key={sub.id} className="row wrap" style={{ gap: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                    <span className="small" style={{ width: 180, fontWeight: 600 }}>{sub.name}</span>
                    {as.map((a) => (
                      <span key={a.id} className="badge badge-info">
                        {a.Teacher?.lastName}, {a.Teacher?.firstName}
                        <button onClick={() => unassign.mutate(a.id)} disabled={unassign.isPending} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }} aria-label="Quitar"><X size={12} /></button>
                      </span>
                    ))}
                    <TeacherSelect people={people} exclude={as.map((a) => a.teacherId)} onPick={(p) => assign.mutate({ divisionId: d.id, subjectId: sub.id, teacherId: p.userId, name: p.name })} />
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
};

/** Las materias de una persona (Personal → Editar → Materias). */
export const PersonAssignments = ({ userId, name }: { userId: number; name: string }) => {
  const { structure, levels, canAssign } = useAssignableLevels();
  const { assign, unassign } = useAssign();
  const [divisionId, setDivisionId] = useState<number | ''>('');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  if (structure.isLoading) return <Skeleton count={3} h={48} />;
  const s = structure.data!;
  const levelIds = new Set(levels.map((l) => l.id));
  const mine = s.divisions.flatMap((d) => (d.TeachingAssignments ?? []).filter((a) => a.teacherId === userId).map((a) => ({ a, d, subject: s.subjects.find((x) => x.id === a.subjectId) })));
  const division = s.divisions.find((d) => d.id === divisionId);
  const subjects = division ? subjectsForDivision(s.subjects, division).filter((x) => !mine.some((m) => m.d.id === division.id && m.a.subjectId === x.id)) : [];
  const levelName = (id: number) => s.levels.find((l) => l.id === id)?.name ?? '';
  return (
    <div className="stack">
      {!mine.length && <p className="small muted">Todavía no tiene materias asignadas en este ciclo.</p>}
      {mine.length > 0 && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {mine.map(({ a, d, subject }) => (
            <div key={a.id} className="list-item">
              <div className="grow">
                <div className="h3">{subject?.name}</div>
                <div className="xs muted">{d.name} · {levelName(d.levelId)}</div>
              </div>
              {canAssign && levelIds.has(d.levelId) && <button className="icon-btn" aria-label="Quitar materia" disabled={unassign.isPending} onClick={() => unassign.mutate(a.id)}><X size={16} /></button>}
            </div>
          ))}
        </div>
      )}
      {canAssign && (
        <div className="card stack" style={{ padding: 12, gap: 8 }}>
          <b className="small">Asignarle una materia</b>
          <div className="row wrap" style={{ gap: 8 }}>
            <select className="select" style={{ flex: '1 1 180px' }} value={divisionId} onChange={(e) => (setDivisionId(e.target.value ? Number(e.target.value) : ''), setSubjectId(''))}>
              <option value="">Elegí el curso</option>
              {levels.map((l) => (
                <optgroup key={l.id} label={l.name}>
                  {s.divisions.filter((d) => d.levelId === l.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </optgroup>
              ))}
            </select>
            <select className="select" style={{ flex: '1 1 180px' }} value={subjectId} disabled={!division} onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{division ? 'Elegí la materia' : 'Primero el curso'}</option>
              {subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button className="btn btn-sm" disabled={!divisionId || !subjectId || assign.isPending} onClick={() => assign.mutate({ divisionId: divisionId as number, subjectId: subjectId as number, teacherId: userId, name }, { onSuccess: () => setSubjectId('') })}>
              <Plus size={14} /> Asignar
            </button>
          </div>
          <span className="xs muted">Si no tiene el rol Docente, se le suma al asignarle la materia. Después cargá sus horas en "Cargos y sueldo".</span>
        </div>
      )}
    </div>
  );
};
