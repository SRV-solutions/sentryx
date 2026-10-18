import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Lock, Unlock, Send, MessageSquarePlus } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Avatar, Badge, Chips, ErrorBox, Skeleton, useToast, fullName, Sheet, Field } from '../../ui';
import type { LevelSettings, Period, PersonLite } from '../../school/types';
import { Entity, Action } from '../../school/permissions';

interface Sheet_ {
  division: { id: number; name: string };
  subject: { id: number; name: string };
  level: { id: number; name: string; type: string; settings: LevelSettings };
  periods: Period[];
  students: PersonLite[];
  grades: Array<{ studentId: number; periodId: number; numericValue: number | null; conceptualValue: string | null; narrative: string | null; observation: string | null }>;
  canEdit: boolean;
  canEditClosed: boolean;
}

type Draft = { numericValue: string; conceptualValue: string; narrative: string; observation: string };
const empty: Draft = { numericValue: '', conceptualValue: '', narrative: '', observation: '' };

export default function GradeSheetPage() {
  const divisionId = Number(useParams().divisionId);
  const subjectId = Number(useParams().subjectId);
  const { can } = useSchool();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['grade-sheet', divisionId, subjectId];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<Sheet_>(`/school/grades/sheet?divisionId=${divisionId}&subjectId=${subjectId}`) });
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [obsFor, setObsFor] = useState<PersonLite | null>(null);
  const [bulk, setBulk] = useState('');

  const d = q.data;
  useEffect(() => {
    if (d && periodId === null) {
      // Abre en el primer período abierto que todavía tiene notas pendientes.
      const loaded = (pid: number) => d.grades.filter((g) => g.periodId === pid).length;
      const pending = d.periods.find((p) => !p.closed && loaded(p.id) < d.students.length);
      setPeriodId((pending ?? d.periods.find((p) => !p.closed) ?? d.periods[d.periods.length - 1])?.id ?? null);
    }
  }, [d, periodId]);

  const period = d?.periods.find((p) => p.id === periodId);
  const original = useMemo(() => {
    const map: Record<number, Draft> = {};
    d?.grades
      .filter((g) => g.periodId === periodId)
      .forEach((g) => {
        map[g.studentId] = {
          numericValue: g.numericValue?.toString() ?? '',
          conceptualValue: g.conceptualValue ?? '',
          narrative: g.narrative ?? '',
          observation: g.observation ?? '',
        };
      });
    return map;
  }, [d, periodId]);

  useEffect(() => setDrafts(original), [original]);

  const dirtyIds = Object.keys(drafts)
    .map(Number)
    .filter((id) => JSON.stringify(drafts[id] ?? empty) !== JSON.stringify(original[id] ?? empty));

  const editable = !!d && !!period && d.canEdit && (!period.closed || d.canEditClosed);

  const save = useMutation({
    mutationFn: () =>
      apiSend<{ saved: number }>('PUT', '/school/grades/sheet', {
        divisionId,
        subjectId,
        periodId,
        entries: dirtyIds.map((studentId) => {
          const v = drafts[studentId];
          return {
            studentId,
            numericValue: v.numericValue === '' ? null : Number(v.numericValue.replace(',', '.')),
            conceptualValue: v.conceptualValue || null,
            narrative: v.narrative || null,
            observation: v.observation || null,
          };
        }),
      }),
    onSuccess: (r) => {
      toast(`Guardado ✅ (${r.saved} cambios)`);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['my-subjects'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const periodAction = useMutation({
    mutationFn: (action: 'close' | 'reopen' | 'publish') =>
      action === 'publish'
        ? apiSend('POST', '/school/grades/publish', { divisionId, periodId })
        : apiSend('POST', `/school/periods/${periodId}/${action}`),
    onSuccess: (_r, action) => {
      toast(action === 'publish' ? 'Boletín publicado: las familias ya pueden verlo' : action === 'close' ? 'Período cerrado' : 'Período reabierto');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  /**
   * Carga rápida: la misma nota a todo el curso (o solo a quienes no tienen nota) y después
   * se corrigen las excepciones una por una. Nada se guarda hasta tocar "Guardar".
   */
  const applyToAll = (onlyEmpty: boolean) => {
    if (!d || !period || !bulk) return;
    const field: keyof Draft = period.kind === 'NUMERIC' ? 'numericValue' : 'conceptualValue';
    setDrafts((prev) => {
      const next = { ...prev };
      d.students.forEach((st) => {
        const cur = next[st.id] ?? empty;
        if (onlyEmpty && cur[field]) return;
        next[st.id] = { ...cur, [field]: bulk };
      });
      return next;
    });
    toast(onlyEmpty ? 'Nota aplicada a quienes no tenían. Ajustá las excepciones y guardá.' : 'Nota aplicada a todo el curso. Ajustá las excepciones y guardá.');
  };

  const set = (studentId: number, patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] ?? empty), ...patch } }));

  if (q.error) return <ErrorBox error={q.error} />;
  if (!d || !period) return <Skeleton count={6} h={56} />;
  const s = d.level.settings;
  const loaded = d.students.filter((st) => {
    const v = drafts[st.id];
    return v && (v.numericValue || v.conceptualValue || v.narrative);
  }).length;

  return (
    <div className="stack" style={{ paddingBottom: dirtyIds.length ? 80 : 0 }}>
      <Link to="/materias" className="row small muted"><ArrowLeft size={16} /> Materias</Link>
      <div>
        <h1 className="h1">{d.subject.name}</h1>
        <p className="muted small">{d.division.name} · {d.level.name} · {loaded}/{d.students.length} cargadas</p>
      </div>

      <Chips
        value={period.id}
        onChange={(v) => {
          if (dirtyIds.length && !confirm('Tenés cambios sin guardar. ¿Cambiar de período igual?')) return;
          setPeriodId(v);
        }}
        items={d.periods.map((p) => ({ value: p.id, label: <>{p.name}{p.closed && ' 🔒'}{p.published && ' ✓'}</> }))}
      />

      <div className="row wrap" style={{ gap: 6 }}>
        <Badge tone="info">{period.kind === 'NUMERIC' ? `Numérica ${s.numericMin}–${s.numericMax} · aprueba con ${s.passingGrade}` : period.kind === 'CONCEPTUAL' ? 'Valoración conceptual' : 'Informe narrativo'}</Badge>
        {period.groupName && <Badge>{period.groupName}</Badge>}
        {period.closed && <Badge tone="warn"><Lock size={12} /> Cerrado</Badge>}
        {period.published && <Badge tone="ok">Publicado a familias</Badge>}
      </div>

      {!d.canEdit && <div className="alert alert-info small">Vista de solo lectura: no dictás esta materia.</div>}
      {d.canEdit && period.closed && !d.canEditClosed && <div className="alert alert-warn small">El período está cerrado. Si necesitás corregir una nota, pedile a la dirección que lo reabra.</div>}

      {editable && period.kind !== 'NARRATIVE' && (
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <div className="h3">Carga rápida</div>
          <div className="row wrap">
            {period.kind === 'NUMERIC' ? (
              <input className="input" style={{ width: 96, textAlign: 'center', fontWeight: 800 }} inputMode="decimal" placeholder="Nota" value={bulk} onChange={(e) => setBulk(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))} aria-label="Nota para todos" />
            ) : (
              <select className="select" style={{ width: 170 }} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Valoración para todos">
                <option value="">Elegí…</option>
                {s.conceptualScale.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <button className="btn btn-sm" disabled={!bulk} onClick={() => applyToAll(false)}>Poner a todos</button>
            <button className="btn btn-sm btn-ghost" disabled={!bulk} onClick={() => applyToAll(true)}>Solo a los vacíos</button>
          </div>
          <span className="xs muted">Después corregí individualmente a quien corresponda y guardá.</span>
        </div>
      )}

      <div className="card list" style={{ overflow: 'hidden' }}>
        {d.students.map((st) => {
          const v = drafts[st.id] ?? empty;
          const num = v.numericValue === '' ? null : Number(v.numericValue.replace(',', '.'));
          const risk = (num !== null && num < s.passingGrade) || v.conceptualValue === s.conceptualScale[s.conceptualScale.length - 1];
          const dirty = dirtyIds.includes(st.id);
          return (
            <div key={st.id} className="list-item" style={{ flexWrap: period.kind === 'NARRATIVE' ? 'wrap' : 'nowrap', background: dirty ? 'var(--info-bg)' : undefined }}>
              <Avatar name={fullName(st)} size="sm" />
              <div className="grow" style={{ minWidth: 120 }}>
                <div className="h3 truncate">{st.lastName}, {st.firstName}</div>
                {v.observation && <div className="xs muted truncate">📝 {v.observation}</div>}
              </div>
              {period.kind === 'NUMERIC' && (
                <input
                  className="input"
                  style={{ width: 84, textAlign: 'center', fontWeight: 800, color: risk ? 'var(--danger)' : undefined }}
                  inputMode="decimal"
                  value={v.numericValue}
                  disabled={!editable}
                  onChange={(e) => set(st.id, { numericValue: e.target.value.replace(/[^\d.,]/g, '').slice(0, 5) })}
                  aria-label={`Nota de ${fullName(st)}`}
                />
              )}
              {period.kind === 'CONCEPTUAL' && (
                <select
                  className="select"
                  style={{ width: 150, color: risk ? 'var(--danger)' : undefined, fontWeight: 700 }}
                  value={v.conceptualValue}
                  disabled={!editable}
                  onChange={(e) => set(st.id, { conceptualValue: e.target.value })}
                  aria-label={`Valoración de ${fullName(st)}`}
                >
                  <option value="">—</option>
                  {s.conceptualScale.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
              {editable && (
                <button className="icon-btn" onClick={() => setObsFor(st)} aria-label="Observación"><MessageSquarePlus size={18} /></button>
              )}
              {period.kind === 'NARRATIVE' && (
                <textarea
                  className="textarea"
                  style={{ width: '100%', minHeight: 90 }}
                  value={v.narrative}
                  disabled={!editable}
                  placeholder="Informe del período…"
                  onChange={(e) => set(st.id, { narrative: e.target.value })}
                />
              )}
            </div>
          );
        })}
      </div>

      {(can(Entity.GRADING_PERIODS, Action.CLOSE) || can(Entity.REPORT_CARDS, Action.PUBLISH)) && (
        <div className="card card-pad stack">
          <h2 className="h3">Cierre del período</h2>
          <div className="row wrap">
            {can(Entity.GRADING_PERIODS, Action.CLOSE) &&
              (period.closed ? (
                <button className="btn btn-sm btn-ghost" onClick={() => periodAction.mutate('reopen')}><Unlock size={16} /> Reabrir período</button>
              ) : (
                <button className="btn btn-sm btn-ghost" onClick={() => confirm(`¿Cerrar ${period.name} para todo el nivel? Los docentes no podrán modificar notas.`) && periodAction.mutate('close')}>
                  <Lock size={16} /> Cerrar período
                </button>
              ))}
            {can(Entity.REPORT_CARDS, Action.PUBLISH) && !period.published && (
              <button className="btn btn-sm" onClick={() => confirm(`¿Publicar el boletín de ${period.name} para ${d.division.name}? Las familias recibirán un aviso.`) && periodAction.mutate('publish')}>
                <Send size={16} /> Publicar boletín a familias
              </button>
            )}
          </div>
        </div>
      )}

      {dirtyIds.length > 0 && (
        <button className="btn btn-accent fab" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save size={18} /> {save.isPending ? 'Guardando…' : `Guardar ${dirtyIds.length} cambio${dirtyIds.length > 1 ? 's' : ''}`}
        </button>
      )}

      <Sheet open={!!obsFor} onClose={() => setObsFor(null)} title={obsFor ? `Observación · ${fullName(obsFor)}` : ''}>
        {obsFor && (
          <div className="stack">
            <Field label="Visible en el boletín" hint="Máximo 500 caracteres">
              <textarea className="textarea" maxLength={500} value={drafts[obsFor.id]?.observation ?? ''} onChange={(e) => set(obsFor.id, { observation: e.target.value })} />
            </Field>
            <button className="btn btn-block" onClick={() => setObsFor(null)}>Listo</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
