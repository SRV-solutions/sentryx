import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Trash2, ArrowUp, ArrowDown, Paperclip, X, Gamepad2, Send, EyeOff } from 'lucide-react';
import { apiGet, apiSend, uploadFile } from '../../lib/api';
import { Badge, Card, ErrorBox, Field, Skeleton, fmtDate, useToast } from '../../ui';
import { useSchool } from '../../school/SchoolContext';
import { Entity, Action } from '../../school/permissions';

interface Unit { id?: number; title: string; contents: string; learningGoals: string; startDate: string | null; endDate: string | null }
interface Program {
  id: number;
  status: 'BORRADOR' | 'PUBLICADO';
  fundamentals: string;
  objectives: string;
  methodology: string;
  evaluation: string;
  bibliography: string;
  fileIds: number[];
  files: Array<{ id: number; name: string; url: string }>;
  publishedAt: string | null;
  canEdit: boolean;
  Units: Unit[];
  Subject?: { name: string; Level?: { name: string } };
  Division?: { name: string } | null;
  Author?: { firstName: string; lastName: string };
}

const SECTIONS: Array<{ key: 'fundamentals' | 'objectives' | 'methodology' | 'evaluation' | 'bibliography'; label: string; placeholder: string }> = [
  { key: 'fundamentals', label: 'Fundamentación', placeholder: 'Por qué y para qué se enseña esta materia en este año.' },
  { key: 'objectives', label: 'Objetivos / propósitos', placeholder: 'Qué se espera que logren los estudiantes.' },
  { key: 'methodology', label: 'Estrategias de enseñanza', placeholder: 'Cómo se va a trabajar: proyectos, salidas, laboratorio…' },
  { key: 'evaluation', label: 'Evaluación', placeholder: 'Criterios e instrumentos de evaluación.' },
  { key: 'bibliography', label: 'Bibliografía', placeholder: 'Libros, sitios y materiales.' },
];

type Draft = Pick<Program, 'fundamentals' | 'objectives' | 'methodology' | 'evaluation' | 'bibliography' | 'fileIds'> & { units: Unit[]; files: Program['files'] };

const toDraft = (p: Program): Draft => ({
  fundamentals: p.fundamentals,
  objectives: p.objectives,
  methodology: p.methodology,
  evaluation: p.evaluation,
  bibliography: p.bibliography,
  fileIds: p.fileIds,
  files: p.files,
  units: p.Units.map((u) => ({ id: u.id, title: u.title, contents: u.contents, learningGoals: u.learningGoals, startDate: u.startDate, endDate: u.endDate })),
});

const Editor = ({ program, onDone }: { program: Program; onDone: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [d, setD] = useState<Draft>(toDraft(program));
  const [uploading, setUploading] = useState(false);
  const save = useMutation({
    mutationFn: () => apiSend('PUT', `/school/programs/${program.id}`, { ...d, files: undefined, units: d.units.map((u) => ({ ...u, startDate: u.startDate || null, endDate: u.endDate || null })) }),
    onSuccess: () => (toast('Programa guardado'), qc.invalidateQueries({ queryKey: ['program', program.id] }), qc.invalidateQueries({ queryKey: ['programs'] }), onDone()),
    onError: (e: Error) => toast(e.message, true),
  });
  const setUnit = (i: number, patch: Partial<Unit>) => setD({ ...d, units: d.units.map((u, j) => (j === i ? { ...u, ...patch } : u)) });
  const move = (i: number, delta: number) => {
    const units = [...d.units];
    const [u] = units.splice(i, 1);
    units.splice(i + delta, 0, u);
    setD({ ...d, units });
  };
  const attach = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadFile(file, { purpose: 'PROGRAM' });
      setD((cur) => ({ ...cur, fileIds: [...cur.fileIds, up.fileId], files: [...cur.files, { id: up.fileId, name: up.name, url: '' }] }));
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="stack">
      <Card>
        <div className="stack">
          <Field label="Programa en PDF o Word (opcional)" hint="Si ya lo tenés armado, subilo. Igual conviene cargar las unidades: los juegos se enlazan a ellas.">
            <div className="stack" style={{ gap: 6 }}>
              {d.files.map((f) => (
                <span key={f.id} className="row small" style={{ gap: 6 }}><Paperclip size={14} /> <span className="grow truncate">{f.name}</span>
                  <button type="button" className="icon-btn" aria-label="Quitar archivo" onClick={() => setD({ ...d, fileIds: d.fileIds.filter((x) => x !== f.id), files: d.files.filter((x) => x.id !== f.id) })}><X size={14} /></button>
                </span>
              ))}
              <label className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} title="Máximo 1 GB por archivo">
                <Paperclip size={14} /> {uploading ? 'Subiendo…' : 'Adjuntar'}
                <input type="file" hidden accept=".pdf,.doc,.docx,.odt,application/pdf" disabled={uploading} onChange={(e) => (attach(e.target.files?.[0]), (e.target.value = ''))} />
              </label>
            </div>
          </Field>
          {SECTIONS.map((s) => (
            <Field key={s.key} label={s.label}><textarea className="textarea" rows={3} maxLength={20000} placeholder={s.placeholder} value={d[s.key]} onChange={(e) => setD({ ...d, [s.key]: e.target.value })} /></Field>
          ))}
        </div>
      </Card>
      <h2 className="h2">Unidades</h2>
      {d.units.map((u, i) => (
        <Card key={u.id ?? `new-${i}`}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 6 }}>
              <Badge tone="info">Unidad {i + 1}</Badge>
              <span className="grow" />
              <button type="button" className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
              <button type="button" className="icon-btn" aria-label="Bajar" disabled={i === d.units.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
              <button type="button" className="icon-btn" aria-label="Quitar unidad" onClick={() => setD({ ...d, units: d.units.filter((_u, j) => j !== i) })}><Trash2 size={15} /></button>
            </div>
            <input className="input" required maxLength={160} placeholder="Título de la unidad" value={u.title} onChange={(e) => setUnit(i, { title: e.target.value })} />
            <textarea className="textarea" rows={3} placeholder="Contenidos" value={u.contents} onChange={(e) => setUnit(i, { contents: e.target.value })} />
            <textarea className="textarea" rows={2} placeholder="Aprendizajes esperados (plan de aprendizaje)" value={u.learningGoals} onChange={(e) => setUnit(i, { learningGoals: e.target.value })} />
            <div className="grid grid-2">
              <Field label="Desde (aprox.)"><input className="input" type="date" value={u.startDate ?? ''} onChange={(e) => setUnit(i, { startDate: e.target.value })} /></Field>
              <Field label="Hasta (aprox.)"><input className="input" type="date" value={u.endDate ?? ''} onChange={(e) => setUnit(i, { endDate: e.target.value })} /></Field>
            </div>
          </div>
        </Card>
      ))}
      <button className="btn btn-ghost" onClick={() => setD({ ...d, units: [...d.units, { title: '', contents: '', learningGoals: '', startDate: null, endDate: null }] })}><Plus size={16} /> Agregar unidad</button>
      <div className="row save-bar" style={{ gap: 8 }}>
        <button className="btn btn-ghost grow" onClick={onDone}>Cancelar</button>
        <button className="btn btn-accent grow" disabled={save.isPending || d.units.some((u) => !u.title.trim())} onClick={() => save.mutate()}>{save.isPending ? 'Guardando…' : 'Guardar programa'}</button>
      </div>
    </div>
  );
};

export default function ProgramPage() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSchool();
  const program = useQuery({ queryKey: ['program', id], queryFn: () => apiGet<Program>(`/school/programs/${id}`) });
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (params.get('editar') && program.data?.canEdit) setEditing(true);
  }, [params, program.data?.canEdit]);
  const publish = useMutation({
    mutationFn: (published: boolean) => apiSend('POST', `/school/programs/${id}/publish`, { published }),
    onSuccess: (_r, published) => (toast(published ? 'Publicado: ya lo ven las familias y los estudiantes' : 'Volvió a borrador'), qc.invalidateQueries({ queryKey: ['program', id] }), qc.invalidateQueries({ queryKey: ['programs'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  const remove = useMutation({
    mutationFn: () => apiSend('DELETE', `/school/programs/${id}`),
    onSuccess: () => (toast('Programa eliminado'), qc.invalidateQueries({ queryKey: ['programs'] }), navigate('/programas')),
    onError: (e: Error) => toast(e.message, true),
  });
  const p = program.data;
  return (
    <div className="stack-lg">
      <Link to="/programas" className="row small muted"><ArrowLeft size={16} /> Programas</Link>
      {program.error && <ErrorBox error={program.error} />}
      {!p && !program.error && <Skeleton count={3} h={90} />}
      {p && (
        <>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <Badge tone={p.status === 'PUBLICADO' ? 'ok' : undefined}>{p.status === 'PUBLICADO' ? `Publicado ${p.publishedAt ? fmtDate(p.publishedAt) : ''}` : 'Borrador'}</Badge>
              {p.Subject?.Level && <Badge>{p.Subject.Level.name}</Badge>}
            </div>
            <h1 className="h1">{p.Subject?.name}{p.Division ? ` · ${p.Division.name}` : ''}</h1>
            <div className="small muted">Prof. {p.Author?.firstName} {p.Author?.lastName}</div>
          </div>
          {editing ? (
            <Editor program={p} onDone={() => setEditing(false)} />
          ) : (
            <>
              {p.canEdit && (
                <div className="row wrap" style={{ gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>
                  <button className="btn btn-sm btn-ghost" disabled={publish.isPending} onClick={() => publish.mutate(p.status !== 'PUBLICADO')}>
                    {p.status === 'PUBLICADO' ? <><EyeOff size={14} /> Pasar a borrador</> : <><Send size={14} /> Publicar</>}
                  </button>
                  {can(Entity.QUIZZES, Action.CREATE) && <Link to="/juegos/nuevo" className="btn btn-sm btn-ghost"><Gamepad2 size={14} /> Crear juego</Link>}
                  <button className="btn btn-sm btn-ghost" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 size={14} /> Eliminar</button>
                </div>
              )}
              {!!p.files.length && (
                <Card>
                  <div className="stack" style={{ gap: 6 }}>
                    {p.files.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="row small" style={{ gap: 6 }}><Paperclip size={14} /> {f.name}</a>)}
                  </div>
                </Card>
              )}
              {SECTIONS.filter((s) => p[s.key]).map((s) => (
                <Card key={s.key}>
                  <h2 className="h3">{s.label}</h2>
                  <p className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{p[s.key]}</p>
                </Card>
              ))}
              <h2 className="h2">Unidades</h2>
              {!p.Units.length && <p className="small muted">Todavía no hay unidades cargadas.</p>}
              {p.Units.map((u, i) => (
                <Card key={u.id}>
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row-between"><h3 className="h3">Unidad {i + 1}: {u.title}</h3>{u.startDate && <span className="xs muted">{fmtDate(u.startDate)}{u.endDate ? ` – ${fmtDate(u.endDate)}` : ''}</span>}</div>
                    {u.contents && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{u.contents}</p>}
                    {u.learningGoals && <div className="alert alert-info small"><div><b>Aprendizajes esperados:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{u.learningGoals}</span></div></div>}
                  </div>
                </Card>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
