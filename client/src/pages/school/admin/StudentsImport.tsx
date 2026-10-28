/**
 * Administración → Alumnos → Importación masiva (CSV con alumnos y familias).
 * Si un curso del archivo no existe, se puede crear ahí mismo con los datos mínimos
 * (nivel, nombre, año y turno) y las filas se asignan solas al curso nuevo.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import { apiSend } from '../../../lib/api';
import { parseCSV, CSV_TEMPLATE, downloadText } from '../../../lib/csv';
import { Card, useToast } from '../../../ui';
import { useSchool } from '../../../school/SchoolContext';
import { Entity, Action } from '../../../school/permissions';
import type { Level, Structure } from '../../../school/types';
import type { Credential } from '../../../school/CredentialsSheet';

/** "2º 1ª", "2° 1a" y "2o 1A" son el mismo curso; "Secundaria" y "Secundario", el mismo nivel. */
export const normName = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[º°]/g, 'o').replace(/ª/g, 'a').replace(/[.\s_-]/g, '');

const levelMatches = (l: Level, raw: string) => {
  const n = normName(raw);
  if (!n) return false;
  const name = normName(l.name);
  const type = normName(l.type);
  return name === n || name.slice(0, 5) === n.slice(0, 5) || type.slice(0, 5) === n.slice(0, 5);
};

/** Año del curso a partir del nombre: "2º 1ª" → 2; en Inicial las salas van como 0. */
const guessGradeYear = (name: string, level?: Level) => {
  if (level?.type === 'INICIAL') return 0;
  const digit = name.match(/\d/)?.[0];
  return digit ? Math.min(7, Number(digit)) : 1;
};

interface Missing {
  key: string;
  /** Nombre tal como viene en el CSV. */
  name: string;
  rawLevel: string;
  levelId: number | null;
  rows: number[];
}
interface Draft { create: boolean; levelId: number | ''; name: string; gradeYear: number; shift: string }
type Row = Record<string, string>;

export const StudentsImportCard = ({ structure, onCredentials }: { structure: Structure; onCredentials: (c: Credential[]) => void }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const { can, session } = useSchool();
  // Quien configura la institución crea en cualquier nivel; la conducción de un nivel, en el suyo.
  const courseLevels = can(Entity.SCHOOL, Action.UPDATE) ? structure.levels : structure.levels.filter((l) => session?.courseLevelIds?.includes(l.id));
  const canCreateCourses = courseLevels.length > 0;
  const [raw, setRaw] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  /** Cursos creados en este momento: clave del CSV → id (por si se les cambió el nombre al crearlos). */
  const [createdAs, setCreatedAs] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Array<{ row: number; message: string }>>([]);
  /** Alumnos de Secundario a los que no se les pudo crear la cuenta (ej: sin DNI): se muestran aparte, no son errores de la fila. */
  const [accountsSkipped, setAccountsSkipped] = useState<Array<{ row: number; student: string; reason: string }>>([]);
  const [sendEmails, setSendEmails] = useState(true);

  /** Busca el curso de cada fila. Lo que no aparece se agrupa para crearlo. */
  const plan = useMemo(() => {
    if (!raw) return null;
    const missing = new Map<string, Missing>();
    const ambiguous: Array<{ row: number; message: string }> = [];
    const divisionIds = raw.map((r, i) => {
      const division = normName(r.division);
      if (!division) {
        ambiguous.push({ row: i + 1, message: 'Falta la columna "division" (el curso).' });
        return 0;
      }
      const level = r.nivel?.trim() ? structure.levels.find((l) => levelMatches(l, r.nivel)) ?? null : null;
      // Si el nivel no existe (o no está a tu cargo), el curso se crea eligiendo el nivel a mano.
      const key = `${level?.id ?? `?${normName(r.nivel)}`}|${division}`;
      if (createdAs[key]) return createdAs[key];
      const candidates = structure.divisions.filter((d) => normName(d.name) === division && (!level || d.levelId === level.id));
      if (candidates.length === 1) return candidates[0].id;
      if (candidates.length > 1) {
        ambiguous.push({ row: i + 1, message: `Hay varios cursos "${r.division}": completá la columna "nivel".` });
        return 0;
      }
      const onlyLevel = structure.levels.length === 1 ? structure.levels[0] : null;
      const m = missing.get(key) ?? { key, name: r.division.trim(), rawLevel: r.nivel?.trim() ?? '', levelId: level?.id ?? (!r.nivel?.trim() ? onlyLevel?.id ?? null : null), rows: [] };
      m.rows.push(i + 1);
      missing.set(key, m);
      return 0;
    });
    return { divisionIds, missing: [...missing.values()], ambiguous };
  }, [raw, structure, createdAs]);

  // Un borrador por curso faltante, con los datos sugeridos.
  useEffect(() => {
    if (!plan) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const m of plan.missing) {
        if (next[m.key]) continue;
        const level = structure.levels.find((l) => l.id === m.levelId);
        next[m.key] = { create: true, levelId: m.levelId ?? '', name: m.name, gradeYear: guessGradeYear(m.name, level), shift: '' };
      }
      return next;
    });
  }, [plan, structure.levels]);

  const onFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setDrafts({});
    setCreatedAs({});
    setResult([]);
    setAccountsSkipped([]);
    setRaw(parseCSV(await file.text()));
  };

  /** Filas que no se importan (curso inexistente o ambiguo), para el resumen final. */
  const unassigned = plan
    ? [...plan.ambiguous, ...plan.missing.flatMap((m) => m.rows.map((row) => ({ row, message: `El curso "${m.name}"${m.rawLevel ? ` (${m.rawLevel})` : ''} no existe: no se importó.` })))]
    : [];

  const createCourses = useMutation({
    mutationFn: async () => {
      const chosen = (plan?.missing ?? []).filter((m) => drafts[m.key]?.create);
      const made: Record<string, number> = {};
      const failed: string[] = [];
      for (const m of chosen) {
        const d = drafts[m.key];
        if (!d.levelId) {
          failed.push(`${d.name}: elegí el nivel`);
          continue;
        }
        try {
          const division = await apiSend<{ id: number }>('POST', '/school/divisions', { levelId: d.levelId, name: d.name.trim(), gradeYear: d.gradeYear, shift: d.shift.trim() || null });
          made[m.key] = division.id;
        } catch (e) {
          failed.push(`${d.name}: ${(e as Error).message}`);
        }
      }
      return { made, failed };
    },
    onSuccess: async ({ made, failed }) => {
      await qc.invalidateQueries({ queryKey: ['structure'] });
      setCreatedAs((prev) => ({ ...prev, ...made }));
      const n = Object.keys(made).length;
      if (n) toast(`${n} ${n === 1 ? 'curso creado' : 'cursos creados'}: sus alumnos ya quedan asignados.`);
      if (failed.length) toast(`No se pudo crear: ${failed.join(' · ')}`, true);
    },
  });

  const runImport = useMutation({
    mutationFn: async () => {
      // Solo las filas con curso; los números de fila se traducen a los del archivo.
      const original: number[] = [];
      const rows = raw!.flatMap((r, i) => {
        const divisionId = plan!.divisionIds[i];
        if (!divisionId) return [];
        original.push(i + 1);
        const guardians = [1, 2]
          .map((n) => ({
            firstName: r[`tutor${n}_nombre`],
            lastName: r[`tutor${n}_apellido`],
            dni: r[`tutor${n}_dni`] || null,
            email: r[`tutor${n}_email`] || null,
            phone: r[`tutor${n}_telefono`] || null,
            relationship: r[`tutor${n}_vinculo`] || 'Tutor/a',
          }))
          .filter((g) => g.firstName && g.lastName);
        return [{ firstName: r.alumno_nombre, lastName: r.alumno_apellido, dni: r.alumno_dni || null, birthDate: r.fecha_nacimiento || null, divisionId, guardians }];
      });
      const r = await apiSend<{ imported: number; errors: Array<{ row: number; message: string }>; credentials: Credential[]; accountsCreated?: number; accountsSkipped?: Array<{ row: number; student: string; reason: string }> }>('POST', '/school/students/import', { rows, sendEmails });
      const toOriginal = (row: number) => original[row - 1] ?? row;
      return {
        ...r,
        credentials: sendEmails ? r.credentials : r.credentials.map((c) => ({ ...c, email: null })),
        errors: r.errors.map((e) => ({ ...e, row: toOriginal(e.row) })),
        accountsSkipped: (r.accountsSkipped ?? []).map((a) => ({ ...a, row: toOriginal(a.row) })),
      };
    },
    onSuccess: (r) => {
      const skipped = plan!.divisionIds.filter((id) => !id).length;
      toast(`${r.imported} alumnos importados${r.accountsCreated ? ` · ${r.accountsCreated} cuentas de estudiante` : ''}${r.errors.length ? ` · ${r.errors.length} con errores` : ''}${skipped ? ` · ${skipped} sin curso` : ''}`, r.errors.length > 0);
      setResult([...r.errors, ...unassigned].sort((a, b) => a.row - b.row));
      setAccountsSkipped(r.accountsSkipped);
      onCredentials(r.credentials);
      setRaw(null);
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['structure'] });
      qc.invalidateQueries({ queryKey: ['people'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const ready = plan ? plan.divisionIds.filter(Boolean).length : 0;
  const toCreate = plan?.missing.filter((m) => drafts[m.key]?.create).length ?? 0;
  const setDraft = (key: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  const errors = raw ? plan?.ambiguous ?? [] : result;

  return (
    <Card>
      <div className="stack">
        <h2 className="h2">Importación masiva</h2>
        <p className="small muted">
          Subí un CSV (Excel → Guardar como CSV) con alumnos y hasta 2 familiares por alumno. Los hermanos se vinculan solos a la misma familia por DNI/email. Si un curso del archivo todavía no existe, lo podés crear acá mismo.
        </p>
        <div className="row wrap">
          <button className="btn btn-sm btn-ghost" onClick={() => downloadText('plantilla-alumnos.csv', CSV_TEMPLATE)}><Download size={16} /> Descargar plantilla</button>
          <label className="btn btn-sm"><Upload size={16} /> Elegir CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} /></label>
          {raw && <span className="xs muted">{fileName}</span>}
        </div>

        {plan && plan.missing.length > 0 && (
          <div className="card stack" style={{ padding: 12, borderColor: 'var(--warn, #F6950A)' }}>
            <div>
              <b className="small">{plan.missing.length === 1 ? 'Un curso del archivo no existe' : `${plan.missing.length} cursos del archivo no existen`}</b>
              <div className="xs muted">
                {canCreateCourses
                  ? 'Revisá los datos y creálos: los alumnos de esas filas quedan asignados solos. El resto (materias, docentes) se completa después en Estructura.'
                  : 'Crear cursos lo pueden hacer Dirección, Rectoría o la Representante Legal (en Administración → Estructura). Mientras tanto, esas filas no se importan.'}
              </div>
            </div>
            {plan.missing.map((m) => {
              const d = drafts[m.key];
              if (!d) return null;
              return (
                <div key={m.key} className="row wrap" style={{ gap: 8, alignItems: 'flex-end', opacity: d.create ? 1 : 0.55 }}>
                  {canCreateCourses && (
                    <label className="row" style={{ gap: 6, alignSelf: 'center' }}>
                      <input type="checkbox" checked={d.create} onChange={(e) => setDraft(m.key, { create: e.target.checked })} />
                    </label>
                  )}
                  <div className="field" style={{ flex: '1 1 120px', margin: 0 }}>
                    <label className="xs">Curso</label>
                    <input className="input" value={d.name} disabled={!canCreateCourses} maxLength={60} onChange={(e) => setDraft(m.key, { name: e.target.value })} />
                  </div>
                  <div className="field" style={{ flex: '1 1 130px', margin: 0 }}>
                    <label className="xs">Nivel{m.rawLevel && !m.levelId ? ` (en el archivo: "${m.rawLevel}")` : ''}</label>
                    <select className="select" value={d.levelId} disabled={!canCreateCourses} onChange={(e) => {
                      const levelId = e.target.value ? Number(e.target.value) : '';
                      setDraft(m.key, { levelId, gradeYear: guessGradeYear(d.name, structure.levels.find((l) => l.id === levelId)) });
                    }}>
                      <option value="">Elegí el nivel</option>
                      {courseLevels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ width: 80, margin: 0 }}>
                    <label className="xs">Año</label>
                    <input className="input" type="number" min={0} max={7} value={d.gradeYear} disabled={!canCreateCourses} onChange={(e) => setDraft(m.key, { gradeYear: Math.max(0, Math.min(7, Number(e.target.value) || 0)) })} />
                  </div>
                  <div className="field" style={{ flex: '1 1 110px', margin: 0 }}>
                    <label className="xs">Turno (opcional)</label>
                    <input className="input" list="import-shifts" value={d.shift} disabled={!canCreateCourses} maxLength={30} onChange={(e) => setDraft(m.key, { shift: e.target.value })} />
                  </div>
                  <span className="xs muted" style={{ alignSelf: 'center' }}>{m.rows.length} {m.rows.length === 1 ? 'alumno' : 'alumnos'}</span>
                </div>
              );
            })}
            <datalist id="import-shifts"><option value="Mañana" /><option value="Tarde" /><option value="Vespertino" /><option value="Jornada completa" /></datalist>
            {canCreateCourses && (
              <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!toCreate || createCourses.isPending} onClick={() => createCourses.mutate()}>
                <Plus size={14} /> {createCourses.isPending ? 'Creando…' : `Crear ${toCreate === 1 ? 'el curso' : `${toCreate} cursos`}`}
              </button>
            )}
          </div>
        )}

        {raw && plan && (
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} />
            <span>Enviar por mail los datos de acceso a los familiares que tengan email<span className="xs muted" style={{ display: 'block' }}>Le llega un botón para entrar directo y elegir su contraseña (sirve una vez, 7 días).</span></span>
          </label>
        )}
        {raw && plan && (
          <div className="alert alert-info">
            <div className="grow small">
              {ready} de {raw.length} filas listas para importar
              {raw.length - ready ? ` · ${raw.length - ready} sin curso (no se importan)` : ''}.
            </div>
            <button className="btn btn-sm" onClick={() => runImport.mutate()} disabled={!ready || runImport.isPending || createCourses.isPending}>{runImport.isPending ? 'Importando…' : `Importar ${ready}`}</button>
          </div>
        )}
        {errors.length > 0 && (
          <div className="alert alert-danger small" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            {errors.slice(0, 30).map((e, i) => <div key={`${e.row}-${i}`}>Fila {e.row}: {e.message}</div>)}
            {errors.length > 30 && <div>… y {errors.length - 30} más</div>}
          </div>
        )}
        {!raw && accountsSkipped.length > 0 && (
          <div className="alert alert-warn small" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <b>Sin cuenta de estudiante ({accountsSkipped.length}):</b>
            {accountsSkipped.slice(0, 30).map((a, i) => <div key={`${a.row}-${i}`}>Fila {a.row} · {a.student}: {a.reason}</div>)}
            {accountsSkipped.length > 30 && <div>… y {accountsSkipped.length - 30} más</div>}
            <div className="xs">Se importaron igual. Cuando esté resuelto, creá la cuenta desde Alertas → Emails de estudiantes ("Crear cuentas del curso").</div>
          </div>
        )}
      </div>
    </Card>
  );
};
