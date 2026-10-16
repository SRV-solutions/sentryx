import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Download, Printer, X, Trash2, Copy, ImagePlus } from 'lucide-react';
import { apiGet, apiSend, uploadFile } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { parseCSV, CSV_TEMPLATE, downloadText } from '../../lib/csv';
import { Badge, Card, ErrorBox, Field, PageHeader, Sheet, Skeleton, Tabs, useToast, Chips, Avatar } from '../../ui';
import { ROLE_LABELS, type SchoolRole, type Structure, type Level, type PeriodKind } from '../../school/types';

type Credential = { name: string; login: string; tempPassword: string; email: string | null; student?: string };

const CredentialsSheet = ({ items, onClose }: { items: Credential[]; onClose: () => void }) => (
  <Sheet open={items.length > 0} onClose={onClose} title="Credenciales generadas">
    <div className="stack">
      <div className="alert alert-warn small">
        Se muestran <b>una sola vez</b>. Quienes tienen email ya las recibieron; al resto entregáselas impresas. Al ingresar se les pide cambiar la contraseña.
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Nombre</th>{items.some((i) => i.student) && <th>Alumno</th>}<th>Usuario</th><th>Contraseña</th></tr></thead>
          <tbody>
            {items.map((c, i) => (
              <tr key={i}><td>{c.name}</td>{items.some((x) => x.student) && <td>{c.student}</td>}<td>{c.login}</td><td><code>{c.tempPassword}</code></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row wrap">
        <button className="btn btn-sm" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
        <button className="btn btn-sm btn-ghost" onClick={() => downloadText('credenciales.csv', 'nombre;alumno;usuario;contrasena\n' + items.map((c) => [c.name, c.student ?? '', c.login, c.tempPassword].join(';')).join('\n'))}>
          <Download size={16} /> Descargar
        </button>
      </div>
    </div>
  </Sheet>
);

/* ===================== INSTITUCIÓN ===================== */

interface SchoolSettings { id: number; name: string; slug: string; cue: string | null; address: string | null; phone: string | null; email: string | null; logoUrl: string | null }

const SchoolTab = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['school-settings'], queryFn: () => apiGet<SchoolSettings>('/school/settings') });
  const [form, setForm] = useState<Partial<SchoolSettings> | null>(null);
  const [uploading, setUploading] = useState(false);
  const data = form ?? q.data;

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiSend('PATCH', '/school/settings', patch),
    onSuccess: () => {
      toast('Datos del colegio guardados');
      setForm(null);
      qc.invalidateQueries({ queryKey: ['school-settings'] });
      qc.invalidateQueries({ queryKey: ['school-session'] });
      qc.invalidateQueries({ queryKey: ['schools'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('El escudo debe ser una imagen (PNG o JPG).', true);
    setUploading(true);
    try {
      const up = await uploadFile(file, { purpose: 'OTHER' });
      save.mutate({ logoFileId: up.fileId });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al subir', true);
    } finally {
      setUploading(false);
    }
  };

  if (q.error) return <ErrorBox error={q.error} />;
  if (!data) return <Skeleton count={2} h={120} />;
  const link = `${window.location.origin}/c/${q.data?.slug}`;
  const field = (k: keyof SchoolSettings, label: string, type = 'text') => (
    <Field label={label}>
      <input className="input" type={type} value={(data[k] as string) ?? ''} onChange={(e) => setForm({ ...data, [k]: e.target.value })} />
    </Field>
  );

  return (
    <div className="stack-lg">
      <Card>
        <div className="row wrap" style={{ gap: 16 }}>
          {q.data?.logoUrl ? (
            <img src={q.data.logoUrl} alt="Escudo" width={84} height={84} style={{ objectFit: 'contain', borderRadius: 14, background: '#fff', padding: 4, border: '1px solid var(--border)' }} />
          ) : (
            <Avatar name={data.name ?? '?'} size="lg" />
          )}
          <div className="grow stack" style={{ gap: 8 }}>
            <div className="h2">{q.data?.name}</div>
            <p className="xs muted">El escudo y el nombre identifican al colegio dentro de la app. La marca Sentryx · SRV se mantiene.</p>
            <div className="row wrap">
              <label className="btn btn-sm"><ImagePlus size={16} /> {uploading ? 'Subiendo…' : 'Subir escudo'}<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadLogo(e.target.files?.[0])} /></label>
              {q.data?.logoUrl && <button className="btn btn-sm btn-ghost" onClick={() => save.mutate({ logoFileId: null })}>Quitar</button>}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="stack">
          <h2 className="h3">Link de ingreso para familias y personal</h2>
          <div className="row">
            <input className="input grow" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copiado'))} aria-label="Copiar"><Copy size={16} /></button>
          </div>
          <p className="xs muted">Muestra el escudo y el nombre del colegio en la pantalla de ingreso. Ideal para mandar por WhatsApp o imprimir con un QR.</p>
        </div>
      </Card>

      <form
        className="card card-pad stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (form) save.mutate({ name: form.name, cue: form.cue || null, address: form.address || null, phone: form.phone || null, email: form.email || null });
        }}
      >
        <h2 className="h3">Datos institucionales</h2>
        {field('name', 'Nombre del colegio')}
        <div className="grid grid-2">
          {field('cue', 'CUE')}
          {field('phone', 'Teléfono', 'tel')}
        </div>
        {field('email', 'Email institucional', 'email')}
        {field('address', 'Dirección')}
        <button className="btn btn-block" disabled={!form || save.isPending}>Guardar</button>
      </form>
    </div>
  );
};

/* ===================== ESTRUCTURA ===================== */

const StructureTab = () => {
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
                <span className="xs muted">{d.studentCount ?? 0} alumnos · {d.shift}</span>
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

/* ===================== PERSONAL ===================== */

interface StaffRow {
  id: number;
  userId: number;
  role: SchoolRole;
  roleLabel: string;
  levelId: number | null;
  divisionIds: number[];
  title: string | null;
  active: boolean;
  Level?: { id: number; name: string } | null;
  User: { id: number; firstName: string; lastName: string; email: string; dni: string | null; lastLogin: string | null };
}

const StaffTab = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => apiGet<StaffRow[]>('/school/staff') });
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure') });
  const [form, setForm] = useState<null | { firstName: string; lastName: string; email: string; dni: string; role: SchoolRole; levelId: number | ''; divisionIds: number[]; title: string }>(null);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [roleFilter, setRoleFilter] = useState<SchoolRole | ''>('');

  const create = useMutation({
    mutationFn: () => apiSend<{ tempPassword: string | null; user: { firstName: string; lastName: string } }>('POST', '/school/staff', {
      ...form,
      email: form!.email || null,
      dni: form!.dni || null,
      levelId: form!.levelId || null,
      title: form!.title || null,
    }),
    onSuccess: (r) => {
      toast('Personal agregado');
      if (r.tempPassword) setCreds([{ name: `${r.user.firstName} ${r.user.lastName}`, login: form!.dni || form!.email, tempPassword: r.tempPassword, email: form!.email || null }]);
      setForm(null);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const toggle = useMutation({
    mutationFn: (m: StaffRow) => apiSend('PATCH', `/school/staff/${m.id}`, { active: !m.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });

  const submit = (e: FormEvent) => (e.preventDefault(), create.mutate());
  const roles = (Object.keys(ROLE_LABELS) as SchoolRole[]).filter((r) => r !== 'TUTOR');
  const list = staff.data?.filter((m) => !roleFilter || m.role === roleFilter) ?? [];

  return (
    <div className="stack">
      <div className="row-between wrap">
        <select className="select" style={{ maxWidth: 240 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as SchoolRole | '')}>
          <option value="">Todos los roles</option>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <button className="btn" onClick={() => setForm({ firstName: '', lastName: '', email: '', dni: '', role: 'DOCENTE', levelId: '', divisionIds: [], title: '' })}><Plus size={18} /> Agregar</button>
      </div>
      {staff.isLoading && <Skeleton count={6} h={56} />}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {list.map((m) => (
          <div key={m.id} className="list-item" style={{ opacity: m.active ? 1 : 0.5 }}>
            <Avatar name={`${m.User.firstName} ${m.User.lastName}`} size="sm" />
            <div className="grow">
              <div className="h3 truncate">{m.User.lastName}, {m.User.firstName}</div>
              <div className="xs muted truncate">{m.User.email.endsWith('@sin-email.local') ? `DNI ${m.User.dni}` : m.User.email}{m.User.lastLogin ? '' : ' · nunca ingresó'}</div>
            </div>
            <Badge tone="info">{m.roleLabel}{m.Level ? ` · ${m.Level.name}` : ''}</Badge>
            <button className="btn btn-sm btn-ghost" onClick={() => toggle.mutate(m)}>{m.active ? 'Desactivar' : 'Activar'}</button>
          </div>
        ))}
      </div>

      <Sheet open={!!form} onClose={() => setForm(null)} title="Agregar personal">
        {form && (
          <form className="stack" onSubmit={submit}>
            <div className="grid grid-2">
              <Field label="Nombre"><input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Apellido"><input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            </div>
            <Field label="Email" hint="Recibe acceso por email. Si no tiene, ingresa con DNI."><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="DNI"><input className="input" inputMode="numeric" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
            <Field label="Rol">
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as SchoolRole })}>
                {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
            {form.role !== 'DOCENTE' && (
              <Field label="Nivel a cargo" hint="Vacío = toda la institución. Ej: Rectoría → Secundario.">
                <select className="select" value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">Toda la institución</option>
                  {structure.data?.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            )}
            {form.role === 'PRECEPTOR' && (
              <Field label="Divisiones a cargo" hint="Vacío = todas las del nivel">
                <div className="chips" style={{ flexWrap: 'wrap' }}>
                  {structure.data?.divisions
                    .filter((d) => !form.levelId || d.levelId === form.levelId)
                    .map((d) => (
                      <button type="button" key={d.id} className={`chip ${form.divisionIds.includes(d.id) ? 'active' : ''}`} onClick={() => setForm({ ...form, divisionIds: form.divisionIds.includes(d.id) ? form.divisionIds.filter((x) => x !== d.id) : [...form.divisionIds, d.id] })}>
                        {d.name}
                      </button>
                    ))}
                </div>
              </Field>
            )}
            <Field label="Cargo (opcional)"><input className="input" placeholder="Ej: Directora de Primaria" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            {form.role === 'DOCENTE' && <p className="xs muted">Las materias se asignan desde la pestaña Estructura.</p>}
            <button className="btn btn-block" disabled={create.isPending || (!form.email && !form.dni)}>Guardar</button>
          </form>
        )}
      </Sheet>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} />
    </div>
  );
};

/* ===================== ALUMNOS Y FAMILIAS ===================== */

const guardianEmpty = { firstName: '', lastName: '', dni: '', email: '', phone: '', relationship: 'Madre' };

const StudentsAdminTab = () => {
  const toast = useToast();
  const qc = useQueryClient();
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure') });
  const [creds, setCreds] = useState<Credential[]>([]);
  const [form, setForm] = useState({ firstName: '', lastName: '', dni: '', birthDate: '', divisionId: 0, guardians: [{ ...guardianEmpty }] });
  const [importRows, setImportRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; message: string }>>([]);

  const divisionByName = useMemo(() => {
    const m = new Map<string, number>();
    structure.data?.divisions.forEach((d) => {
      const level = structure.data!.levels.find((l) => l.id === d.levelId)?.name.toLowerCase();
      m.set(`${level}|${d.name.toLowerCase()}`, d.id);
      if (![...m.keys()].some((k) => k !== `${level}|${d.name.toLowerCase()}` && k.endsWith(`|${d.name.toLowerCase()}`))) m.set(`|${d.name.toLowerCase()}`, d.id);
    });
    return m;
  }, [structure.data]);

  const create = useMutation({
    mutationFn: () =>
      apiSend<{ credentials: Credential[] }>('POST', '/school/students', {
        firstName: form.firstName,
        lastName: form.lastName,
        dni: form.dni || null,
        birthDate: form.birthDate || null,
        divisionId: form.divisionId,
        guardians: form.guardians.filter((g) => g.firstName && (g.dni || g.email)).map((g) => ({ ...g, email: g.email || null, dni: g.dni || null, phone: g.phone || null })),
      }),
    onSuccess: (r) => {
      toast('Alumno y familia cargados ✅');
      setCreds(r.credentials);
      setForm({ ...form, firstName: '', lastName: '', dni: '', birthDate: '', guardians: [{ ...guardianEmpty }] });
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['structure'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const runImport = useMutation({
    mutationFn: () => apiSend<{ imported: number; errors: Array<{ row: number; message: string }>; credentials: Credential[] }>('POST', '/school/students/import', { rows: importRows, sendEmails: true }),
    onSuccess: (r) => {
      toast(`${r.imported} alumnos importados${r.errors.length ? ` · ${r.errors.length} con errores` : ''}`, r.errors.length > 0);
      setImportErrors(r.errors);
      setCreds(r.credentials);
      setImportRows(null);
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['structure'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const onFile = async (file?: File) => {
    if (!file) return;
    const rows = parseCSV(await file.text());
    const mapped = rows.map((r) => {
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
      const key = `${(r.nivel ?? '').toLowerCase()}|${(r.division ?? '').toLowerCase()}`;
      return {
        firstName: r.alumno_nombre,
        lastName: r.alumno_apellido,
        dni: r.alumno_dni || null,
        birthDate: r.fecha_nacimiento || null,
        divisionId: divisionByName.get(key) ?? divisionByName.get(`|${(r.division ?? '').toLowerCase()}`) ?? 0,
        guardians,
      };
    });
    setImportErrors(mapped.flatMap((m, i) => (m.divisionId ? [] : [{ row: i + 1, message: `División "${rows[i].division}" no encontrada` }])));
    setImportRows(mapped);
  };

  if (!structure.data) return <Skeleton count={3} h={90} />;
  const setG = (i: number, patch: Partial<typeof guardianEmpty>) => setForm({ ...form, guardians: form.guardians.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  return (
    <div className="stack-lg">
      <Card>
        <div className="stack">
          <h2 className="h2">Importación masiva</h2>
          <p className="small muted">Subí un CSV (Excel → Guardar como CSV) con alumnos y hasta 2 familiares por alumno. Los hermanos se vinculan solos a la misma familia por DNI/email.</p>
          <div className="row wrap">
            <button className="btn btn-sm btn-ghost" onClick={() => downloadText('plantilla-alumnos.csv', CSV_TEMPLATE)}><Download size={16} /> Descargar plantilla</button>
            <label className="btn btn-sm"><Upload size={16} /> Elegir CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} /></label>
          </div>
          {importRows && (
            <div className="alert alert-info">
              <div className="grow small">{importRows.length} filas listas para importar{importErrors.length ? ` · ${importErrors.length} con división desconocida` : ''}.</div>
              <button className="btn btn-sm" onClick={() => runImport.mutate()} disabled={runImport.isPending}>{runImport.isPending ? 'Importando…' : 'Importar'}</button>
            </div>
          )}
          {importErrors.length > 0 && (
            <div className="alert alert-danger small" style={{ flexDirection: 'column' }}>
              {importErrors.slice(0, 20).map((e) => <div key={e.row}>Fila {e.row}: {e.message}</div>)}
            </div>
          )}
        </div>
      </Card>

      <form className="card card-pad stack" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
        <h2 className="h2">Alta individual</h2>
        <div className="grid grid-2">
          <Field label="Nombre"><input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
          <Field label="Apellido"><input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
          <Field label="DNI"><input className="input" inputMode="numeric" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
          <Field label="Nacimiento"><input className="input" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
        </div>
        <Field label="División">
          <select className="select" required value={form.divisionId || ''} onChange={(e) => setForm({ ...form, divisionId: Number(e.target.value) })}>
            <option value="">Elegí la división</option>
            {structure.data.levels.map((l) => (
              <optgroup key={l.id} label={l.name}>
                {structure.data!.divisions.filter((d) => d.levelId === l.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        {form.guardians.map((g, i) => (
          <div key={i} className="card card-pad stack" style={{ background: 'var(--surface-2)' }}>
            <div className="row-between">
              <h3 className="h3">Familiar {i + 1}</h3>
              {form.guardians.length > 1 && <button type="button" className="icon-btn" onClick={() => setForm({ ...form, guardians: form.guardians.filter((_, j) => j !== i) })} aria-label="Quitar"><Trash2 size={16} /></button>}
            </div>
            <div className="grid grid-2">
              <Field label="Nombre"><input className="input" value={g.firstName} onChange={(e) => setG(i, { firstName: e.target.value })} /></Field>
              <Field label="Apellido"><input className="input" value={g.lastName} onChange={(e) => setG(i, { lastName: e.target.value })} /></Field>
              <Field label="DNI"><input className="input" inputMode="numeric" value={g.dni} onChange={(e) => setG(i, { dni: e.target.value })} /></Field>
              <Field label="Vínculo">
                <select className="select" value={g.relationship} onChange={(e) => setG(i, { relationship: e.target.value })}>
                  {['Madre', 'Padre', 'Tutor/a', 'Abuelo/a', 'Otro'].map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Email"><input className="input" type="email" value={g.email} onChange={(e) => setG(i, { email: e.target.value })} /></Field>
              <Field label="Teléfono"><input className="input" inputMode="tel" value={g.phone} onChange={(e) => setG(i, { phone: e.target.value })} /></Field>
            </div>
          </div>
        ))}
        {form.guardians.length < 4 && <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setForm({ ...form, guardians: [...form.guardians, { ...guardianEmpty, relationship: 'Padre' }] })}><Plus size={16} /> Otro familiar</button>}
        <button className="btn btn-accent btn-block" disabled={create.isPending || !form.divisionId}>Guardar alumno y familia</button>
      </form>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} />
    </div>
  );
};

export default function AdminPage() {
  const { can } = useSchool();
  const tabs = [
    ...(can('school.manage') ? [{ value: 'school' as const, label: 'Institución' }, { value: 'structure' as const, label: 'Estructura' }] : []),
    ...(can('people.manage') ? [{ value: 'staff' as const, label: 'Personal' }, { value: 'students' as const, label: 'Alumnos y familias' }] : []),
  ];
  const [tab, setTab] = useState<(typeof tabs)[number]['value']>(tabs[0]?.value ?? 'staff');
  return (
    <div className="stack-lg">
      <PageHeader title="Administración" subtitle="Estructura escolar, personal, alumnos y familias." />
      <Tabs value={tab} onChange={setTab} items={tabs} />
      {tab === 'school' && <SchoolTab />}
      {tab === 'structure' && <StructureTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'students' && <StudentsAdminTab />}
    </div>
  );
}
