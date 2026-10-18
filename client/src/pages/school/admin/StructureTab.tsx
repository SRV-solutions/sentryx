/** Administración → Estructura. */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { apiGet, apiSend } from '../../../lib/api';
import { Card, ErrorBox, Skeleton, useToast, Chips } from '../../../ui';
import { type Structure, type Level, type PeriodKind } from '../../../school/types';
import type { StaffRow } from './StaffTab';
import { DefaultStructureCard, GradingSchemeCard, EditDivisionButton } from './AcademicSetupCards';

export const StructureTab = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const s = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure') });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => apiGet<StaffRow[]>('/school/staff') });
  const [levelId, setLevelId] = useState<number | null>(null);
  const [newDivision, setNewDivision] = useState({ name: '', gradeYear: 1, shift: 'Mañana' });
  const [newSubject, setNewSubject] = useState('');
  const [scaleText, setScaleText] = useState<string | null>(null);

  const level = s.data?.levels.find((l) => l.id === (levelId ?? s.data?.levels[0]?.id));
  const refresh = () => qc.invalidateQueries({ queryKey: ['structure'] });
  const onErr = (e: Error) => toast(e.message, true);

  const createDivision = useMutation({ mutationFn: () => apiSend('POST', '/school/divisions', { levelId: level!.id, ...newDivision }), onSuccess: () => (refresh(), setNewDivision({ ...newDivision, name: '' }), toast('División creada')), onError: onErr });
  const createSubject = useMutation({ mutationFn: () => apiSend('POST', '/school/subjects', { levelId: level!.id, name: newSubject }), onSuccess: () => (refresh(), setNewSubject(''), toast('Materia creada')), onError: onErr });
  const assign = useMutation({ mutationFn: (b: { divisionId: number; subjectId: number; teacherId: number }) => apiSend('POST', '/school/assignments', b), onSuccess: refresh, onError: onErr });
  const unassign = useMutation({ mutationFn: (id: number) => apiSend('DELETE', `/school/assignments/${id}`), onSuccess: refresh, onError: onErr });
  const updatePeriod = useMutation({ mutationFn: ({ id, ...b }: { id: number; name?: string; kind?: PeriodKind; startDate?: string | null; endDate?: string | null }) => apiSend('PATCH', `/school/periods/${id}`, b), onSuccess: () => (refresh(), toast('Período actualizado')), onError: onErr });
  const updateLevel = useMutation({ mutationFn: (settings: Level['settings']) => apiSend('PATCH', `/school/levels/${level!.id}`, { settings }), onSuccess: () => (refresh(), setScaleText(null), toast('Configuración guardada')), onError: onErr });

  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data || !level) return <Skeleton count={4} h={90} />;
  const divisions = s.data.divisions.filter((d) => d.levelId === level.id);
  const subjects = s.data.subjects.filter((x) => x.levelId === level.id);
  const periods = s.data.periods.filter((p) => p.levelId === level.id);
  const teachers = staff.data?.filter((m) => m.role === 'DOCENTE' && m.active) ?? [];

  return (
    <div className="stack-lg">
      <DefaultStructureCard structure={s.data} />
      <GradingSchemeCard structure={s.data} />
      <Chips value={level.id} onChange={setLevelId} items={s.data.levels.map((l) => ({ value: l.id, label: l.name }))} />

      <Card>
        <div className="stack">
          <h2 className="h2">Calificación y asistencia · {level.name}</h2>
          <div className="small">
            Escala conceptual:{' '}
            {scaleText === null ? (
              <>
                <b>{level.settings.conceptualScale.join(' · ')}</b>{' '}
                <button className="btn btn-sm btn-ghost" onClick={() => setScaleText(level.settings.conceptualScale.join(', '))}>Editar</button>
              </>
            ) : (
              <span className="row" style={{ marginTop: 6 }}>
                <input className="input grow" value={scaleText} onChange={(e) => setScaleText(e.target.value)} />
                <button className="btn btn-sm" onClick={() => updateLevel.mutate({ ...level.settings, conceptualScale: scaleText.split(',').map((x) => x.trim()).filter(Boolean) })}>Guardar</button>
              </span>
            )}
          </div>
          <div className="small">Numérica: {level.settings.numericMin}–{level.settings.numericMax} · aprueba con <b>{level.settings.passingGrade}</b></div>
          <div className="small">Valor de inasistencias: ausente {level.settings.attendanceWeights.AUSENTE} · tarde {level.settings.attendanceWeights.TARDE} · retiro {level.settings.attendanceWeights.RETIRO}</div>
        </div>
      </Card>

      <section className="stack">
        <h2 className="h2">Períodos de calificación</h2>
        <div className="card list" style={{ overflow: 'hidden' }}>
          {periods.map((p) => (
            <div key={p.id} className="list-item wrap">
              <div className="grow" style={{ minWidth: 140 }}>
                <div className="h3">{p.name}</div>
                <div className="xs muted">{p.groupName}{p.closedAt && ' · Cerrado'}</div>
              </div>
              <select className="select" style={{ width: 150 }} value={p.kind} onChange={(e) => updatePeriod.mutate({ id: p.id, kind: e.target.value as PeriodKind })}>
                <option value="CONCEPTUAL">Conceptual</option>
                <option value="NUMERIC">Numérica</option>
                <option value="NARRATIVE">Informe</option>
              </select>
              <input type="date" className="input" style={{ width: 160 }} value={p.startDate ?? ''} onChange={(e) => updatePeriod.mutate({ id: p.id, startDate: e.target.value || null })} aria-label="Inicio" />
              <input type="date" className="input" style={{ width: 160 }} value={p.endDate ?? ''} onChange={(e) => updatePeriod.mutate({ id: p.id, endDate: e.target.value || null })} aria-label="Fin" />
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2 className="h2">Materias</h2>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {subjects.map((x) => <span key={x.id} className="chip">{x.name}</span>)}
        </div>
        <form className="row" onSubmit={(e) => (e.preventDefault(), newSubject.trim().length >= 2 && createSubject.mutate())}>
          <input className="input grow" placeholder="Nueva materia (ej: Matemática)" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
          <button className="btn"><Plus size={18} /></button>
        </form>
      </section>

      <section className="stack">
        <h2 className="h2">Divisiones y docentes</h2>
        <form className="row wrap" onSubmit={(e) => (e.preventDefault(), newDivision.name && createDivision.mutate())}>
          <input className="input" style={{ flex: '2 1 140px' }} placeholder="Nombre (ej: 3º B)" value={newDivision.name} onChange={(e) => setNewDivision({ ...newDivision, name: e.target.value })} />
          <input className="input" style={{ flex: '1 1 80px' }} type="number" min={0} max={7} value={newDivision.gradeYear} onChange={(e) => setNewDivision({ ...newDivision, gradeYear: Number(e.target.value) })} aria-label="Año" />
          <select className="select" style={{ flex: '1 1 120px' }} value={newDivision.shift} onChange={(e) => setNewDivision({ ...newDivision, shift: e.target.value })}>
            {['Mañana', 'Tarde', 'Vespertino', 'Jornada completa'].map((x) => <option key={x}>{x}</option>)}
          </select>
          <button className="btn"><Plus size={18} /> División</button>
        </form>
        {divisions.map((d) => (
          <Card key={d.id}>
            <div className="stack">
              <div className="row-between">
                <div className="h3">{d.name}</div>
                <span className="row xs muted" style={{ gap: 4 }}>{d.studentCount ?? 0} alumnos · {d.shift}<EditDivisionButton division={d} /></span>
              </div>
              {subjects.map((sub) => {
                const as = d.TeachingAssignments?.filter((a) => a.subjectId === sub.id) ?? [];
                return (
                  <div key={sub.id} className="row wrap" style={{ gap: 6 }}>
                    <span className="small" style={{ width: 160, fontWeight: 600 }}>{sub.name}</span>
                    {as.map((a) => (
                      <span key={a.id} className="badge badge-info">
                        {a.Teacher?.firstName} {a.Teacher?.lastName}
                        <button onClick={() => unassign.mutate(a.id)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }} aria-label="Quitar"><X size={12} /></button>
                      </span>
                    ))}
                    <select className="select" style={{ width: 180, minHeight: 34, padding: '4px 10px', fontSize: 14 }} value="" onChange={(e) => e.target.value && assign.mutate({ divisionId: d.id, subjectId: sub.id, teacherId: Number(e.target.value) })}>
                      <option value="">+ Asignar docente</option>
                      {teachers.map((t) => <option key={t.userId} value={t.userId}>{t.User.lastName}, {t.User.firstName}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
};
