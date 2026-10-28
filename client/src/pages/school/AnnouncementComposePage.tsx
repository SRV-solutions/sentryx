import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, X, Send, Save, Clock, FolderOpen, UserPlus, Reply, AlertTriangle, CheckCheck, Users } from 'lucide-react';
import { FilePicker } from '../../school/FilePicker';
import { uploadLimitLabel } from '../../school/plans';
import { useSchool } from '../../school/SchoolContext';
import { apiGet, apiSend, uploadFile, formatBytes, type UploadedFile, type UploadPurpose } from '../../lib/api';
import { Avatar, Field, PageHeader, Skeleton, useToast, Chips, ErrorBox, Empty, Sheet } from '../../ui';
import {
  ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_CATEGORY_HINTS, ANNOUNCEMENT_CATEGORY_LABELS, AUDIENCE_TARGET_LABELS, NON_STAFF_CATEGORIES,
  type AnnouncementCategory, type AudienceTarget, type AudienceType, type AttachmentRef, type Contact, type LevelType,
} from '../../school/types';
import { Entity, Action } from '../../school/permissions';
import type { AnnouncementStatus } from './AnnouncementsPage';
import { FamilyPicker } from '../../school/FamilyPicker';
import { StudentPicker } from '../../school/StudentPicker';
import { PeoplePicker } from '../../school/PeoplePicker';
import { CategoryBadge, PickedChips, PERSONAL_AUDIENCES, TARGETABLE_AUDIENCES, DEFAULT_TARGET, type Picked } from '../../school/announcements';
import type { PersonDetail } from '../../school/PersonProfile';

interface Audiences {
  schoolWide: boolean;
  levels: Array<{ id: number; name: string; type?: LevelType }>;
  divisions: Array<{ id: number; name: string; levelId: number; gradeYear?: number }>;
  /** Hay algún curso de Secundario en el alcance: solo ahí los estudiantes tienen cuenta. */
  canTargetStudents?: boolean;
}

/** Borrador o programado que se está editando (GET /announcements/:id). */
interface Editable {
  id: number;
  title: string;
  body: string;
  audience: { type: AudienceType; ids: number[]; includeStaff?: boolean; target?: AudienceTarget; extraUserIds?: number[] };
  requiresAck: boolean;
  priority: 'NORMAL' | 'URGENT';
  category?: AnnouncementCategory;
  allowReplies?: boolean;
  attachments: Array<AttachmentRef & { fileId?: number }>;
  status: AnnouncementStatus;
  scheduledAt: string | null;
  isAuthor: boolean;
}

interface StudentLite { id: number; firstName: string; lastName: string; Enrollments?: Array<{ Division?: { name: string } }> }

type Mode = 'send' | 'draft' | 'schedule';
type Sent = { id: number; recipientCount: number; status: AnnouncementStatus };

/** Fecha local "AAAA-MM-DDTHH:mm" para <input type="datetime-local">. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const defaultSchedule = () => {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d.toISOString());
};
const isOneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/**
 * Completa los nombres de lo elegido que llegó solo con id (borrador en edición, ?alumno=, ?para=).
 * Tope de 40: es solo para mostrar los chips; el servidor valida igual.
 */
const useResolveNames = (items: Picked[], set: Dispatch<SetStateAction<Picked[]>>, fetchName: (id: number) => Promise<string>) => {
  const missing = items.filter((i) => i.name == null).slice(0, 40).map((i) => i.id).join(',');
  useEffect(() => {
    if (!missing) return;
    let alive = true;
    Promise.all(missing.split(',').map(Number).map((id) => fetchName(id).then((n) => [id, n] as const, () => [id, null] as const))).then((pairs) => {
      if (!alive) return;
      const names = new Map(pairs);
      set((prev) => prev.map((p) => (p.name == null && names.get(p.id) ? { ...p, name: names.get(p.id)! } : p)));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);
};

/** Adjuntos: subir del dispositivo o (personal) elegir de "Mis archivos". */
const Attachments = ({ files, setFiles, max, purpose, library }: { files: UploadedFile[]; setFiles: Dispatch<SetStateAction<UploadedFile[]>>; max: number; purpose: UploadPurpose; library?: boolean }) => {
  const { session } = useSchool();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);
  if (session?.features?.fileUploads === false) return null;
  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(list).slice(0, max - files.length)) {
        const up = await uploadFile(f, { purpose });
        setFiles((prev) => [...prev, up]);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al subir', true);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {files.map((f) => (
        <div key={f.fileId} className="row card" style={{ padding: '8px 12px' }}>
          <Paperclip size={16} /> <span className="grow truncate small">{f.name}</span>
          <span className="xs muted">{formatBytes(f.size)}</span>
          <button type="button" className="icon-btn" onClick={() => setFiles((p) => p.filter((x) => x.fileId !== f.fileId))} aria-label={`Quitar ${f.name}`}><X size={16} /></button>
        </div>
      ))}
      <div className="row wrap" style={{ gap: 8 }}>
        <label className="btn btn-ghost btn-sm" aria-disabled={files.length >= max} style={files.length >= max ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
          <Paperclip size={16} /> {uploading ? 'Subiendo…' : 'Adjuntar archivo'}
          <input type="file" hidden multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} disabled={uploading || files.length >= max} />
        </label>
        {library && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(true)} disabled={files.length >= max}><FolderOpen size={16} /> Elegir de mis archivos</button>}
      </div>
      <span className="xs muted">Hasta {max} archivos de {uploadLimitLabel(session?.features?.maxUploadMb)} cada uno.</span>
      {library && <FilePicker open={picking} onClose={() => setPicking(false)} max={max - files.length} exclude={files.map((f) => f.fileId)} onPick={(picked) => setFiles((prev) => [...prev, ...picked.filter((p) => !prev.some((x) => x.fileId === p.fileId))])} />}
      {uploading && <span className="xs muted" aria-live="polite">Subiendo archivo…</span>}
    </div>
  );
};

/** "Permitir respuestas": cada respuesta abre un chat privado con quien envió. */
const RepliesCheck = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="check" style={{ alignItems: 'flex-start' }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <Reply size={14} /> Permitir respuestas
      <span className="xs muted" style={{ display: 'block' }}>Cada respuesta llega solo a vos, en una conversación privada.</span>
    </span>
  </label>
);

/**
 * Nuevo comunicado. Un solo lugar para todos: el personal arma la audiencia (alumnos, cursos, niveles,
 * familias, colegas…); las familias y estudiantes le escriben a los docentes y a la escuela por un alumno.
 */
export default function AnnouncementComposePage() {
  const { session, can } = useSchool();
  const [params] = useSearchParams();
  const editingId = Number(useParams().id) || null;
  if (!session) return <Skeleton count={4} h={70} />;
  const canStaff = session.isStaff && can(Entity.ANNOUNCEMENTS, Action.CREATE);
  const studentSelf = session.self && !session.isStaff ? session.self.studentId : null;
  const canPersonal = !!studentSelf || session.isGuardian;
  const presetAlumno = Number(params.get('alumno')) || null;
  // Personal que además es familia: si llega por uno de sus hijos (o lo pide), escribe como familia.
  const asFamily = params.get('como') === 'familia' || (!!presetAlumno && session.childIds.includes(presetAlumno));
  if (canStaff && (editingId || !(asFamily && canPersonal))) return <StaffCompose editingId={editingId} canPersonal={canPersonal} />;
  if (canPersonal) return <PersonalCompose studentSelf={studentSelf} canStaff={canStaff} />;
  return (
    <div className="page-narrow stack" style={{ margin: '0 auto', width: '100%' }}>
      <PageHeader title="Nuevo comunicado" />
      <div className="alert alert-warn">Tu rol no tiene permiso para enviar comunicados. Pedíselo a la conducción.</div>
    </div>
  );
}

/* ───────────────────────── Personal (docentes, preceptoría, conducción) ───────────────────────── */

const StaffCompose = ({ editingId, canPersonal }: { editingId: number | null; canPersonal: boolean }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSchool();
  const [params] = useSearchParams();
  const opts = useQuery({ queryKey: ['audiences'], queryFn: () => apiGet<Audiences>('/school/announcements/audiences') });
  const existing = useQuery({ queryKey: ['announcement', editingId], queryFn: () => apiGet<Editable>(`/school/announcements/${editingId}`), enabled: !!editingId });

  const presetDivision = Number(params.get('division')) || null;
  const presetStudent = Number(params.get('alumno')) || null;
  const presetUser = Number(params.get('para')) || null;
  const [type, setType] = useState<AudienceType>(presetStudent ? 'STUDENTS' : presetUser ? 'USERS' : 'DIVISION');
  const [ids, setIds] = useState<number[]>(presetDivision ? [presetDivision] : []);
  const [students, setStudents] = useState<Picked[]>(presetStudent ? [{ id: presetStudent, name: null }] : []);
  const [people, setPeople] = useState<Picked[]>(presetUser ? [{ id: presetUser, name: params.get('nombre') }] : []);
  const [extras, setExtras] = useState<Picked[]>([]);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [target, setTarget] = useState<AudienceTarget>(DEFAULT_TARGET);
  const [includeStaff, setIncludeStaff] = useState(false);
  const [category, setCategory] = useState<AnnouncementCategory>('INSTITUCIONAL');
  /** null = lo decide el tipo de audiencia (personal → sí, masiva → no) hasta que la persona lo toque. */
  const [repliesChoice, setRepliesChoice] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [requiresAck, setRequiresAck] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [loaded, setLoaded] = useState(false);

  useResolveNames(students, setStudents, (id) => apiGet<{ firstName: string; lastName: string }>(`/school/students/${id}`).then((s) => `${s.firstName} ${s.lastName}`));
  const personName = (id: number) => apiGet<PersonDetail>(`/school/people/${id}`).then((p) => `${p.firstName} ${p.lastName}`);
  useResolveNames(people, setPeople, personName);
  useResolveNames(extras, setExtras, personName);

  // Edición: se cargan los datos del borrador una sola vez.
  useEffect(() => {
    const a = existing.data;
    if (!a || loaded) return;
    const t = a.audience.type;
    setType(t);
    const picks = a.audience.ids.map((id) => ({ id, name: null }));
    if (t === 'STUDENTS') setStudents(picks);
    else if (t === 'USERS') setPeople(picks);
    else setIds(a.audience.ids);
    setIncludeStaff(!!a.audience.includeStaff);
    setTarget(a.audience.target ?? DEFAULT_TARGET);
    setExtras((a.audience.extraUserIds ?? []).map((id) => ({ id, name: null })));
    setCategory(a.category ?? 'INSTITUCIONAL');
    setRepliesChoice(a.allowReplies ?? false);
    setTitle(a.title);
    setBody(a.body);
    setRequiresAck(a.requiresAck);
    setUrgent(a.priority === 'URGENT');
    setFiles(a.attachments.filter((f) => f.fileId).map((f) => ({ fileId: f.fileId!, name: f.name, size: f.size ?? 0, mimeType: f.type ?? '' })));
    if (a.status === 'SCHEDULED' && a.scheduledAt) {
      setScheduling(true);
      setScheduledAt(toLocalInput(a.scheduledAt));
    }
    setLoaded(true);
  }, [existing.data, loaded]);

  const levels = opts.data?.levels ?? [];
  const divisions = opts.data?.divisions ?? [];
  const audienceTypes = useMemo(() => {
    const list: Array<{ value: AudienceType; label: string }> = [{ value: 'STUDENTS', label: 'Alumnos' }, { value: 'DIVISION', label: 'Cursos' }];
    if (levels.length) list.push({ value: 'LEVEL', label: 'Niveles' });
    if (opts.data?.schoolWide) list.push({ value: 'SCHOOL', label: 'Toda la institución' });
    list.push({ value: 'GUARDIANS', label: 'Familias (elegir)' });
    if (opts.data?.schoolWide || session?.scope.levelIds.length) list.push({ value: 'STAFF', label: 'Personal' });
    list.push({ value: 'USERS', label: 'Personas' });
    return list;
  }, [opts.data, levels.length, session?.scope.levelIds.length]);

  // Solo Secundario tiene cuentas de estudiante: si lo elegido no incluye ningún curso de Secundario, no hay a quién.
  const studentsPossible = useMemo(() => {
    if (!opts.data?.canTargetStudents) return false;
    const levelType = new Map(levels.map((l) => [l.id, l.type]));
    if (type === 'DIVISION' && ids.length) return ids.some((id) => levelType.get(divisions.find((d) => d.id === id)?.levelId ?? 0) === 'SECUNDARIO');
    if (type === 'LEVEL' && ids.length) return ids.some((id) => levelType.get(id) === 'SECUNDARIO');
    return true;
  }, [opts.data, levels, divisions, type, ids]);
  const targetable = isOneOf(TARGETABLE_AUDIENCES, type);
  const effectiveTarget: AudienceTarget = studentsPossible ? target : 'FAMILIES';
  const allowReplies = repliesChoice ?? isOneOf(PERSONAL_AUDIENCES, type);
  const toggle = (id: number) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const audienceIds = type === 'SCHOOL' ? [] : type === 'STUDENTS' ? students.map((s) => s.id) : type === 'USERS' ? people.map((p) => p.id) : ids;
  const payload = (mode: Mode) => ({
    title,
    body,
    audience: {
      type,
      ids: audienceIds,
      includeStaff: (type === 'DIVISION' || type === 'LEVEL' || type === 'STUDENTS') && includeStaff,
      ...(targetable ? { target: effectiveTarget } : {}),
      ...(type !== 'USERS' && extras.length ? { extraUserIds: extras.map((e) => e.id) } : {}),
    },
    category,
    allowReplies,
    requiresAck,
    priority: urgent ? 'URGENT' : 'NORMAL',
    attachments: files.map((f) => ({ fileId: f.fileId })),
    mode,
    ...(mode === 'schedule' ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
  });
  const save = useMutation({
    mutationFn: (mode: Mode) =>
      editingId ? apiSend<Sent>('PUT', `/school/announcements/${editingId}`, payload(mode)) : apiSend<Sent>('POST', '/school/announcements', payload(mode)),
    onSuccess: (a, mode) => {
      toast(mode === 'send' ? `Comunicado enviado a ${a.recipientCount} destinatarios` : mode === 'draft' ? 'Borrador guardado' : 'Comunicado programado');
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcement', a.id] });
      navigate(`/comunicados/${a.id}`, { replace: true });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const needsIds = type !== 'SCHOOL' && type !== 'STAFF';
  const valid = title.trim().length >= 3 && !!body.trim() && (!needsIds || audienceIds.length > 0);
  const scheduleValid = !scheduling || new Date(scheduledAt).getTime() > Date.now() + 60_000;
  const busy = save.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !scheduleValid) return;
    save.mutate(scheduling ? 'schedule' : 'send');
  };

  if (opts.isLoading || (editingId && existing.isLoading)) return <div className="page-narrow" style={{ margin: '0 auto', width: '100%' }}><Skeleton count={4} h={90} /></div>;
  if (opts.error) return <ErrorBox error={opts.error} retry={() => opts.refetch()} />;
  if (editingId && existing.error) return <ErrorBox error={existing.error} />;
  if (editingId && existing.data && (!existing.data.isAuthor || (existing.data.status !== 'DRAFT' && existing.data.status !== 'SCHEDULED')))
    return <div className="alert alert-warn">Este comunicado ya fue enviado: no se puede editar.</div>;

  const extraExclude = type === 'USERS' ? people.map((p) => p.id) : type === 'GUARDIANS' ? ids : [];

  return (
    <form className="stack-lg page-narrow" style={{ margin: '0 auto', width: '100%' }} onSubmit={submit}>
      <PageHeader title={editingId ? 'Editar comunicado' : 'Nuevo comunicado'} subtitle="Llega al instante por la app, notificación push y, si hace falta, por email. También podés guardarlo como borrador o programarlo." />
      {canPersonal && !editingId && (
        <Link to="/comunicados/nuevo?como=familia" className="small" style={{ marginTop: -12 }}>¿Escribís como familia? Escribile a la escuela por tu hijo/a →</Link>
      )}

      <section className="card card-pad stack" aria-labelledby="aud-h">
        <h2 className="h3" id="aud-h">¿A quién?</h2>
        <Chips value={type} onChange={(v) => (setType(v), v !== type && setIds([]))} items={audienceTypes} />

        {type === 'STUDENTS' && <StudentPicker value={students} onChange={setStudents} divisions={divisions} />}
        {type === 'DIVISION' && (
          <div className="chips" style={{ flexWrap: 'wrap' }} role="group" aria-label="Cursos">
            {divisions.map((d) => (
              <button type="button" key={d.id} className={`chip ${ids.includes(d.id) ? 'active' : ''}`} aria-pressed={ids.includes(d.id)} onClick={() => toggle(d.id)}>{d.name}</button>
            ))}
            {!divisions.length && <span className="small muted">No tenés cursos a cargo este año.</span>}
          </div>
        )}
        {(type === 'LEVEL' || (type === 'STAFF' && levels.length > 1)) && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="chips" style={{ flexWrap: 'wrap' }} role="group" aria-label="Niveles">
              {levels.map((l) => (
                <button type="button" key={l.id} className={`chip ${ids.includes(l.id) ? 'active' : ''}`} aria-pressed={ids.includes(l.id)} onClick={() => toggle(l.id)}>{l.name}</button>
              ))}
            </div>
            {type === 'STAFF' && <span className="xs muted">Sin elegir niveles: todo el personal {opts.data?.schoolWide ? 'de la institución' : 'de tus niveles'}.</span>}
          </div>
        )}
        {type === 'SCHOOL' && <p className="small muted">Todos los alumnos de todos los niveles y el personal.</p>}
        {type === 'GUARDIANS' && <FamilyPicker value={ids} onChange={setIds} levels={levels} divisions={divisions} />}
        {type === 'USERS' && <PeoplePicker value={people} onChange={setPeople} />}

        {targetable && (
          <div className="stack" style={{ gap: 8 }}>
            <h3 className="small" style={{ fontWeight: 800 }}>¿Quién lo recibe?</h3>
            <div className="chips" role="radiogroup" aria-label="¿Quién lo recibe?">
              {(['FAMILIES', 'STUDENTS', 'BOTH'] as AudienceTarget[]).map((t) => {
                const disabled = t !== 'FAMILIES' && !studentsPossible;
                return (
                  <button type="button" key={t} role="radio" aria-checked={effectiveTarget === t} className={`chip ${effectiveTarget === t ? 'active' : ''}`} disabled={disabled} style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} onClick={() => setTarget(t)}>
                    {AUDIENCE_TARGET_LABELS[t]}
                  </button>
                );
              })}
            </div>
            {!studentsPossible ? (
              <span className="xs muted">Solo Secundario: los estudiantes tienen cuenta desde 1º año.</span>
            ) : effectiveTarget !== 'FAMILIES' && (
              <span className="xs muted">Les llega a los estudiantes con cuenta (Secundario); los de otros niveles no lo reciben.</span>
            )}
          </div>
        )}
        {(type === 'DIVISION' || type === 'LEVEL' || type === 'STUDENTS') && (
          <label className="check">
            <input type="checkbox" checked={includeStaff} onChange={(e) => setIncludeStaff(e.target.checked)} /> Enviar copia a los docentes de esos cursos
          </label>
        )}

        {type !== 'USERS' && (
          <div className="stack" style={{ gap: 8 }}>
            {extras.length > 0 && <span className="xs muted">También lo reciben:</span>}
            <PickedChips items={extras} onRemove={(id) => setExtras((p) => p.filter((x) => x.id !== id))} />
            <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setExtrasOpen(true)}><UserPlus size={16} /> Sumar más gente</button></div>
          </div>
        )}
      </section>

      <section className="card card-pad stack">
        <Field label="Tipo" hint={ANNOUNCEMENT_CATEGORY_HINTS[category]}>
          <div className="row" style={{ gap: 8 }}>
            <select className="select grow" value={category} onChange={(e) => setCategory(e.target.value as AnnouncementCategory)} aria-label="Tipo de comunicado">
              {ANNOUNCEMENT_CATEGORIES.map((c) => <option key={c} value={c}>{ANNOUNCEMENT_CATEGORY_LABELS[c]}</option>)}
            </select>
            <span className="hide-mobile"><CategoryBadge category={category} /></span>
          </div>
        </Field>
        <Field label="Título">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ej: Reunión de padres del 3º B" required />
        </Field>
        <Field label="Mensaje">
          <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={20000} placeholder="Escribí el comunicado…" required />
        </Field>
        <Attachments files={files} setFiles={setFiles} max={10} purpose="ANNOUNCEMENT" library />

        <label className="check" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          <span><AlertTriangle size={14} /> Urgente <span className="xs muted" style={{ display: 'block' }}>También se envía por email.</span></span>
        </label>
        <RepliesCheck checked={allowReplies} onChange={setRepliesChoice} />
        <label className="check" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
          <span><CheckCheck size={14} /> Pedir confirmación de lectura <span className="xs muted" style={{ display: 'block' }}>Cada destinatario toca "Confirmo que lo leí" y ves quién falta.</span></span>
        </label>
      </section>

      <section className="card card-pad stack">
        <label className="check">
          <input type="checkbox" checked={scheduling} onChange={(e) => setScheduling(e.target.checked)} /> <Clock size={16} /> Programar el envío
        </label>
        {scheduling && (
          <Field label="Se envía el" hint="Sale solo a esa hora, aunque no estés conectado. Hasta entonces podés editarlo o cancelarlo.">
            <input type="datetime-local" className="input" value={scheduledAt} min={toLocalInput(new Date(Date.now() + 2 * 60_000).toISOString())} onChange={(e) => setScheduledAt(e.target.value)} style={{ maxWidth: 260 }} />
            {!scheduleValid && <p className="field-error">La fecha tiene que ser futura.</p>}
          </Field>
        )}
      </section>

      <div className="stack" style={{ gap: 8 }}>
        <button className="btn btn-accent btn-block" disabled={!valid || !scheduleValid || busy}>
          {scheduling ? <Clock size={18} /> : <Send size={18} />} {save.isPending ? 'Guardando…' : scheduling ? 'Programar envío' : 'Enviar'}
        </button>
        <button type="button" className="btn btn-ghost btn-block" disabled={!valid || busy} onClick={() => save.mutate('draft')}>
          <Save size={18} /> Guardar como borrador
        </button>
        {!valid && needsIds && !audienceIds.length && <span className="xs muted" style={{ textAlign: 'center' }}>Elegí a quién se lo mandás.</span>}
      </div>

      <Sheet open={extrasOpen} onClose={() => setExtrasOpen(false)} title="Sumar más gente">
        <div className="stack">
          <p className="small muted">Colegas, familias o estudiantes que lo reciben además de la audiencia elegida.</p>
          <PeoplePicker value={extras} onChange={setExtras} exclude={extraExclude} autoFocus />
          <button type="button" className="btn btn-accent btn-block" onClick={() => setExtrasOpen(false)}>Listo{extras.length ? ` (${extras.length})` : ''}</button>
        </div>
      </Sheet>
    </form>
  );
};

/* ───────────────────────── Familias y estudiantes ───────────────────────── */

/** Docentes / Preceptoría / Conducción, sin repetir a quien da varias materias. */
const groupContacts = (list: Contact[]) => {
  const byUser = new Map<number, Contact & { details: string[] }>();
  for (const c of list) {
    const prev = byUser.get(c.userId);
    if (prev) {
      if (c.detail && !prev.details.includes(c.detail)) prev.details.push(c.detail);
    } else byUser.set(c.userId, { ...c, details: c.detail ? [c.detail] : [] });
  }
  const groups: Array<{ key: string; label: string; items: Array<Contact & { details: string[] }> }> = [
    { key: 'doc', label: 'Docentes', items: [] },
    { key: 'pre', label: 'Preceptoría', items: [] },
    { key: 'sec', label: 'Secretaría', items: [] },
    { key: 'con', label: 'Conducción', items: [] },
  ];
  // Por la etiqueta del rol (roleLabel): "Preceptoría" y "Jefatura de preceptores" van juntas; secretaría no es conducción.
  const groupOf = (role: string) => (role === 'Docente' ? 0 : /precept/i.test(role) ? 1 : /secretar/i.test(role) ? 2 : 3);
  for (const c of byUser.values()) groups[groupOf(c.role)].items.push(c);
  return groups.filter((g) => g.items.length);
};

const PersonalCompose = ({ studentSelf, canStaff }: { studentSelf: number | null; canStaff: boolean }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const presetPara = Number(params.get('para')) || null;
  const [studentId, setStudentId] = useState<number | null>(studentSelf ?? (Number(params.get('alumno')) || null));
  const [recipientIds, setRecipientIds] = useState<number[]>(presetPara ? [presetPara] : []);
  const [category, setCategory] = useState<AnnouncementCategory>('CONSULTA');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [allowReplies, setAllowReplies] = useState(true);

  const children = useQuery({ queryKey: ['my-children'], queryFn: () => apiGet<StudentLite[]>('/school/my-children'), enabled: !studentSelf });
  const contacts = useQuery({ queryKey: ['contacts', studentId], queryFn: () => apiGet<Contact[]>(`/school/threads/contacts?studentId=${studentId}`), enabled: !!studentId });
  // Con un solo hijo no hace falta elegir.
  useEffect(() => {
    if (!studentId && children.data?.length === 1) setStudentId(children.data[0].id);
  }, [children.data, studentId]);

  const groups = useMemo(() => groupContacts(contacts.data ?? []), [contacts.data]);
  const allowed = useMemo(() => new Set((contacts.data ?? []).map((c) => c.userId)), [contacts.data]);
  // ?para= o lo elegido para otro hijo puede no estar entre los contactos de este: se descarta.
  const chosen = recipientIds.filter((id) => allowed.has(id));
  const toggle = (id: number) => setRecipientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 30 ? prev : [...prev, id]));

  const send = useMutation({
    mutationFn: () =>
      apiSend<Sent>('POST', '/school/announcements/personal', {
        studentId, recipientIds: chosen, title: title.trim(), body, category, allowReplies, attachments: files.map((f) => ({ fileId: f.fileId })),
      }),
    onSuccess: (a) => {
      toast(a.recipientCount === 1 ? 'Enviado' : `Enviado a ${a.recipientCount} personas`);
      qc.invalidateQueries({ queryKey: ['announcements'] });
      navigate(`/comunicados/${a.id}`, { replace: true });
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const valid = !!studentId && chosen.length > 0 && title.trim().length >= 3 && !!body.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid && !send.isPending) send.mutate();
  };
  let step = 0;

  return (
    <form className="stack-lg page-narrow" style={{ margin: '0 auto', width: '100%' }} onSubmit={submit}>
      <PageHeader title="Nuevo comunicado" subtitle={studentSelf ? 'Escribile a tus docentes o a preceptoría.' : 'Escribile a los docentes, a preceptoría o a la conducción del nivel.'} />
      {canStaff && <Link to="/comunicados/nuevo" className="small" style={{ marginTop: -12 }}>← Volver al comunicado institucional</Link>}

      {!studentSelf && (
        <section className="card card-pad stack" aria-labelledby="who-h">
          <h2 className="h3" id="who-h">{++step}. ¿Sobre quién?</h2>
          {children.isLoading && <Skeleton count={1} h={40} />}
          {children.error && <ErrorBox error={children.error} retry={() => children.refetch()} />}
          {children.data && !children.data.length && <span className="small muted">No hay alumnos vinculados a tu cuenta.</span>}
          <div className="chips" style={{ flexWrap: 'wrap' }} role="radiogroup" aria-label="¿Sobre quién?">
            {children.data?.map((s) => (
              <button type="button" key={s.id} role="radio" aria-checked={studentId === s.id} className={`chip ${studentId === s.id ? 'active' : ''}`} onClick={() => setStudentId(s.id)}>
                {s.firstName} {s.lastName}
                {s.Enrollments?.[0]?.Division && <span style={{ opacity: 0.7 }}> · {s.Enrollments[0].Division.name}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {studentId && (
        <section className="card card-pad stack" aria-labelledby="to-h">
          <div className="row-between">
            <h2 className="h3" id="to-h">{++step}. ¿A quién le escribís?</h2>
            {chosen.length > 0 && <span className="badge badge-info"><Users size={12} /> {chosen.length}</span>}
          </div>
          {contacts.isLoading && <Skeleton count={3} h={52} />}
          {contacts.error && <ErrorBox error={contacts.error} retry={() => contacts.refetch()} />}
          {contacts.data && !contacts.data.length && <Empty title="No hay destinatarios disponibles" text="Todavía no hay docentes ni preceptores asignados al curso." />}
          {groups.map((g) => {
            const allOn = g.items.every((c) => chosen.includes(c.userId));
            return (
              <div key={g.key} className="stack" style={{ gap: 6 }}>
                <div className="row-between">
                  <span className="xs muted" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 }}>{g.label}</span>
                  {g.items.length > 1 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRecipientIds((prev) => (allOn ? prev.filter((id) => !g.items.some((c) => c.userId === id)) : [...new Set([...prev, ...g.items.map((c) => c.userId)])].slice(0, 30)))}>
                      {allOn ? 'Quitar todos' : 'Elegir todos'}
                    </button>
                  )}
                </div>
                <div className="card list" style={{ overflow: 'hidden' }}>
                  {g.items.map((c) => {
                    const on = chosen.includes(c.userId);
                    return (
                      <label key={c.userId} className="list-item" style={{ cursor: 'pointer', background: on ? 'var(--info-bg)' : undefined }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(c.userId)} style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} aria-label={c.name} />
                        <Avatar name={c.name} src={c.avatar} size="sm" />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="h3 truncate">{c.name}</div>
                          <div className="xs muted truncate">{[c.role, c.details.join(', ')].filter(Boolean).join(' · ')}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {studentId && (
        <section className="card card-pad stack" aria-labelledby="msg-h">
          <h2 className="h3" id="msg-h">{++step}. Mensaje</h2>
          <Field label="Tipo" hint={ANNOUNCEMENT_CATEGORY_HINTS[category]}>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value as AnnouncementCategory)} aria-label="Tipo de mensaje">
              {NON_STAFF_CATEGORIES.map((c) => <option key={c} value={c}>{ANNOUNCEMENT_CATEGORY_LABELS[c]}</option>)}
            </select>
          </Field>
          <Field label="Asunto">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ej: Consulta sobre la tarea de Matemática" required />
          </Field>
          <Field label="Mensaje">
            <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} rows={6} placeholder="Escribí tu mensaje…" required />
          </Field>
          <Attachments files={files} setFiles={setFiles} max={5} purpose="MESSAGE" />
          <RepliesCheck checked={allowReplies} onChange={setAllowReplies} />
          <button className="btn btn-accent btn-block" disabled={!valid || send.isPending}>
            <Send size={18} /> {send.isPending ? 'Enviando…' : 'Enviar'}
          </button>
          {!chosen.length && <span className="xs muted" style={{ textAlign: 'center' }}>Elegí al menos un destinatario.</span>}
        </section>
      )}
    </form>
  );
};
