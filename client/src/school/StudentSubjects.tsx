import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight, MessageCircle } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Avatar, Badge, Empty, ErrorBox, Sheet, Skeleton } from '../ui';
import type { GradeValue, LevelType, PeriodKind } from './types';

type Teacher = { id: number; firstName: string; lastName: string; avatar: string | null };
export interface StudentSubjectsData {
  division: { id: number; name: string; gradeYear: number | null } | null;
  level: { id: number; name: string; type: LevelType } | null;
  periods: Array<{ id: number; name: string; kind: PeriodKind; groupName: string | null }>;
  subjects: Array<{ id: number; name: string; teachers: Teacher[]; grades: Record<number, GradeValue>; final: number | string | null; finalApproved: boolean | null }>;
  onlyPublished: boolean;
}
type SubjectRow = StudentSubjectsData['subjects'][number];

/** Misma clave que usa el formulario de convivencia (lista de materias): se comparte la caché. */
export const useStudentSubjects = (studentId: number, enabled = true) =>
  useQuery({ queryKey: ['student-subjects', studentId], queryFn: () => apiGet<StudentSubjectsData>(`/school/students/${studentId}/subjects`), enabled, retry: false });

const gradeText = (g: GradeValue | undefined, kind: PeriodKind) => {
  if (!g) return null;
  if (kind === 'NUMERIC') return g.numericValue != null ? String(g.numericValue) : null;
  if (kind === 'CONCEPTUAL') return g.conceptualValue;
  return g.narrative ? 'Informe' : null;
};

/** Última nota cargada (recorre los períodos del más nuevo al más viejo). */
const latest = (row: SubjectRow, periods: StudentSubjectsData['periods']) => {
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i];
    const text = gradeText(row.grades[p.id], p.kind);
    if (text) return { text, period: p.name, atRisk: !!row.grades[p.id]?.atRisk };
  }
  return null;
};

const writeLink = (teacherId: number, studentId: number, self: boolean) => `/comunicados/nuevo?para=${teacherId}${self ? '' : `&alumno=${studentId}`}`;

const TeacherRow = ({ t, studentId, canWrite, self }: { t: Teacher; studentId: number; canWrite: boolean; self: boolean }) => (
  <div className="row" style={{ gap: 8 }}>
    <Avatar name={`${t.firstName} ${t.lastName}`} src={t.avatar} size="sm" />
    <span className="small grow truncate">{t.firstName} {t.lastName}</span>
    {canWrite && <Link to={writeLink(t.id, studentId, self)} className="btn btn-sm btn-ghost"><MessageCircle size={14} /> Escribir</Link>}
  </div>
);

/**
 * "Materias" del perfil del estudiante: todas las materias de su curso con sus docentes y notas.
 * Familia y estudiante ven solo lo publicado (lo decide la API: onlyPublished).
 */
export const StudentSubjects = ({ studentId, canWrite, self }: { studentId: number; canWrite: boolean; self: boolean }) => {
  const q = useStudentSubjects(studentId);
  const [openId, setOpenId] = useState<number | null>(null);
  if (q.isLoading) return <Skeleton count={4} h={96} />;
  if (q.error) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const d = q.data!;
  if (!d.division) return <Empty title="Sin inscripción en el ciclo actual" text="Cuando esté inscripto/a en un curso, acá aparecen sus materias y notas." icon={<BookOpen size={36} strokeWidth={1.5} />} />;
  if (!d.subjects.length) return <Empty title="Todavía no hay materias cargadas" text={`La escuela todavía no cargó las materias de ${d.division.name}.`} icon={<BookOpen size={36} strokeWidth={1.5} />} />;
  const open = d.subjects.find((s) => s.id === openId) ?? null;
  const hasGrades = (s: SubjectRow) => d.periods.some((p) => gradeText(s.grades[p.id], p.kind) || s.grades[p.id]?.observation);

  return (
    <div className="stack">
      {d.onlyPublished && <p className="small muted">Se muestran solo las notas publicadas por la escuela.</p>}
      <div className="grid grid-auto">
        {d.subjects.map((s) => {
          const last = latest(s, d.periods);
          const risk = Object.values(s.grades).some((g) => g?.atRisk);
          return (
            <div key={s.id} className="card card-pad stack" style={{ gap: 10, borderLeft: risk ? '4px solid var(--danger)' : undefined }}>
              <button type="button" className="row" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', textAlign: 'left', width: '100%' }} onClick={() => setOpenId(s.id)} aria-label={`Ver notas de ${s.name}`}>
                <div className="grow">
                  <div className="h3">{s.name}</div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    {last ? <Badge tone={last.atRisk ? 'danger' : 'info'}>{last.text} · {last.period}</Badge> : <Badge>Sin notas</Badge>}
                    {risk && <Badge tone="danger">En riesgo</Badge>}
                    {s.final != null && <Badge tone={s.finalApproved === false ? 'danger' : 'ok'}>Final {s.final}</Badge>}
                  </div>
                </div>
                <ChevronRight size={18} className="muted" />
              </button>
              {s.teachers.length ? (
                <div className="stack" style={{ gap: 6 }}>
                  {s.teachers.map((t) => <TeacherRow key={t.id} t={t} studentId={studentId} canWrite={canWrite} self={self} />)}
                </div>
              ) : (
                <div className="xs muted">Sin docente asignado</div>
              )}
            </div>
          );
        })}
      </div>

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? 'Materia'}>
        {open && (
          <div className="stack">
            {!hasGrades(open) ? (
              <Empty title="Todavía no hay notas" text={d.onlyPublished ? 'Las notas aparecen cuando la escuela publica el boletín del período.' : 'Ningún docente cargó notas en esta materia.'} />
            ) : (
              <div className="card list" style={{ overflow: 'hidden' }}>
                {d.periods.map((p) => {
                  const g = open.grades[p.id];
                  const text = gradeText(g, p.kind);
                  if (!text && !g?.observation) return null;
                  return (
                    <div key={p.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                      <div className="grow">
                        <div className="h3">{p.name}</div>
                        {p.groupName && <div className="xs muted">{p.groupName}</div>}
                        {p.kind === 'NARRATIVE' && g?.narrative && <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: 4 }}>{g.narrative}</p>}
                        {g?.observation && <p className="small muted" style={{ marginTop: 4 }}>{g.observation}</p>}
                      </div>
                      {text && p.kind !== 'NARRATIVE' && <Badge tone={g?.atRisk ? 'danger' : 'info'}>{text}</Badge>}
                    </div>
                  );
                })}
                {open.final != null && (
                  <div className="list-item">
                    <div className="grow h3">Nota final</div>
                    <Badge tone={open.finalApproved === false ? 'danger' : 'ok'}>{open.final}{open.finalApproved != null ? ` · ${open.finalApproved ? 'Aprobada' : 'No aprobada'}` : ''}</Badge>
                  </div>
                )}
              </div>
            )}
            {d.onlyPublished && <p className="xs muted">Se muestran solo las notas publicadas.</p>}
            {open.teachers.length > 0 && (
              <>
                <h3 className="h3">{open.teachers.length > 1 ? 'Docentes' : 'Docente'}</h3>
                <div className="stack" style={{ gap: 8 }}>
                  {open.teachers.map((t) => <TeacherRow key={t.id} t={t} studentId={studentId} canWrite={canWrite} self={self} />)}
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
};
