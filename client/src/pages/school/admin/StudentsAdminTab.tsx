/** Administración → Alumnos y familias. */
import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { apiGet, apiSend } from '../../../lib/api';
import { Field, Skeleton, useToast } from '../../../ui';
import { useSchool } from '../../../school/SchoolContext';
import { type Structure } from '../../../school/types';
import { CredentialsSheet, type Credential } from '../../../school/CredentialsSheet';
import { StudentsImportCard } from './StudentsImport';

const guardianEmpty = { firstName: '', lastName: '', dni: '', email: '', phone: '', relationship: 'Madre' };
type GuardianForm = typeof guardianEmpty;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Errores por campo de cada familiar. Un familiar a medio cargar ya no se descarta en silencio. */
const guardianErrors = (g: GuardianForm, all: GuardianForm[]) => {
  const e: Partial<Record<keyof GuardianForm, string>> = {};
  const touched = Object.entries(g).some(([k, v]) => k !== 'relationship' && String(v).trim());
  if (!touched) return e;
  if (!g.firstName.trim()) e.firstName = 'Falta el nombre';
  if (!g.lastName.trim()) e.lastName = 'Falta el apellido';
  const dni = g.dni.replace(/\D/g, '');
  if (!dni && !g.email.trim()) e.dni = 'Cargá DNI o email (lo usa para ingresar)';
  if (dni && (dni.length < 7 || dni.length > 8)) e.dni = 'El DNI debe tener 7 u 8 dígitos';
  if (g.email.trim() && !EMAIL_RE.test(g.email.trim())) e.email = 'Email inválido';
  const others = all.filter((o) => o !== g);
  if (dni && others.some((o) => o.dni.replace(/\D/g, '') === dni)) e.dni = 'Otro familiar tiene el mismo DNI';
  if (g.email.trim() && others.some((o) => o.email.trim().toLowerCase() === g.email.trim().toLowerCase())) e.email = 'Otro familiar tiene el mismo email: cada uno necesita el suyo (o dejalo vacío y entra con DNI)';
  return e;
};
const isBlank = (g: GuardianForm) => !Object.entries(g).some(([k, v]) => k !== 'relationship' && String(v).trim());

export const StudentsAdminTab = () => {
  const toast = useToast();
  const qc = useQueryClient();
  const full = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure') });
  const { session } = useSchool();
  // Cada directivo carga alumnos en SU alcance: Rectoría en Secundario, Dirección en su nivel, Secretaría en todos.
  const scoped = useMemo(() => new Set(session?.levels.map((l) => l.id) ?? []), [session]);
  const structure = useMemo(() => (full.data ? { ...full, data: { ...full.data, levels: full.data.levels.filter((l) => scoped.has(l.id)), divisions: full.data.divisions.filter((d) => scoped.has(d.levelId)) } } : full), [full, scoped]);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [form, setForm] = useState({ firstName: '', lastName: '', dni: '', birthDate: '', divisionId: 0, guardians: [{ ...guardianEmpty }] });
  const [submitError, setSubmitError] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [showErrors, setShowErrors] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      apiSend<{ credentials: Credential[]; guardiansLinked: number }>('POST', '/school/students', {
        firstName: form.firstName,
        lastName: form.lastName,
        dni: form.dni || null,
        birthDate: form.birthDate || null,
        divisionId: form.divisionId,
        guardians: form.guardians.filter((g) => !isBlank(g)).map((g) => ({ ...g, email: g.email.trim() || null, dni: g.dni.trim() || null, phone: g.phone.trim() || null })),
        sendEmail,
      }),
    onSuccess: (r) => {
      const n = r.guardiansLinked ?? 0;
      toast(`Alumno cargado con ${n} familiar${n === 1 ? '' : 'es'} ✅`);
      setCreds(r.credentials);
      setSubmitError('');
      setShowErrors(false);
      setForm({ ...form, firstName: '', lastName: '', dni: '', birthDate: '', guardians: [{ ...guardianEmpty }] });
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['structure'] });
      qc.invalidateQueries({ queryKey: ['people'] });
    },
    onError: (e: Error) => setSubmitError(e.message),
  });

  if (!structure.data) return <Skeleton count={3} h={90} />;
  const setG = (i: number, patch: Partial<typeof guardianEmpty>) => setForm({ ...form, guardians: form.guardians.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const gErrors = form.guardians.map((g) => guardianErrors(g, form.guardians));
  const hasErrors = gErrors.some((e) => Object.keys(e).length > 0);
  const filled = form.guardians.filter((g) => !isBlank(g)).length;
  const submitStudent = (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (hasErrors) {
      setShowErrors(true);
      return setSubmitError('Revisá los datos marcados en rojo de los familiares.');
    }
    create.mutate();
  };
  const err = (i: number, k: keyof GuardianForm) => (showErrors || form.guardians[i][k] ? gErrors[i][k] : undefined);

  return (
    <div className="stack-lg">
      <StudentsImportCard structure={structure.data} onCredentials={setCreds} />

      <form className="card card-pad stack" onSubmit={submitStudent} noValidate>
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
              <Field label="Nombre"><input className={`input ${err(i, 'firstName') ? 'invalid' : ''}`} value={g.firstName} onChange={(e) => setG(i, { firstName: e.target.value })} />{err(i, 'firstName') && <span className="field-error">{err(i, 'firstName')}</span>}</Field>
              <Field label="Apellido"><input className={`input ${err(i, 'lastName') ? 'invalid' : ''}`} value={g.lastName} onChange={(e) => setG(i, { lastName: e.target.value })} />{err(i, 'lastName') && <span className="field-error">{err(i, 'lastName')}</span>}</Field>
              <Field label="DNI"><input className={`input ${err(i, 'dni') ? 'invalid' : ''}`} inputMode="numeric" value={g.dni} onChange={(e) => setG(i, { dni: e.target.value })} />{err(i, 'dni') && <span className="field-error">{err(i, 'dni')}</span>}</Field>
              <Field label="Vínculo">
                <select className="select" value={g.relationship} onChange={(e) => setG(i, { relationship: e.target.value })}>
                  {['Madre', 'Padre', 'Tutor/a', 'Abuelo/a', 'Otro'].map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Email"><input className={`input ${err(i, 'email') ? 'invalid' : ''}`} type="email" value={g.email} onChange={(e) => setG(i, { email: e.target.value })} />{err(i, 'email') && <span className="field-error">{err(i, 'email')}</span>}</Field>
              <Field label="Teléfono"><input className="input" inputMode="tel" value={g.phone} onChange={(e) => setG(i, { phone: e.target.value })} /></Field>
            </div>
          </div>
        ))}
        {form.guardians.length < 4 && <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setForm({ ...form, guardians: [...form.guardians, { ...guardianEmpty, relationship: 'Padre' }] })}><Plus size={16} /> Otro familiar</button>}
        <p className="xs muted">Cada familiar ingresa con su propio DNI o email. Si mamá y papá comparten un email, cargalo en uno solo y el otro entra con su DNI.</p>
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          <span>Enviar por mail los datos de acceso a los familiares que tengan email<span className="xs muted" style={{ display: 'block' }}>Le llega un botón para entrar directo y elegir su contraseña (sirve una vez, 7 días).</span></span>
        </label>
        {submitError && <div className="alert alert-danger small">{submitError}</div>}
        <button className="btn btn-accent btn-block" disabled={create.isPending || !form.divisionId || !form.firstName || !form.lastName}>
          {create.isPending ? 'Guardando…' : `Guardar alumno${filled ? ` y ${filled} familiar${filled === 1 ? '' : 'es'}` : ''}`}
        </button>
      </form>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} />
    </div>
  );
};
