/** Administración → Personal. */
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiGet, apiSend } from '../../../lib/api';
import { useSchool } from '../../../school/SchoolContext';
import { Badge, Field, Sheet, Skeleton, useToast, Avatar } from '../../../ui';
import { ROLE_LABELS, type SchoolRole, type Structure } from '../../../school/types';
import { CredentialsSheet, type Credential } from '../../../school/CredentialsSheet';
import { ResetPasswordButton } from '../../../school/PersonProfile';
import { useAuth } from '../../../context/AuthContext';
import { StaffImportButton } from './StaffImport';

export interface StaffRow {
  id: number;
  userId: number;
  role: SchoolRole;
  roleLabel: string;
  levelId: number | null;
  divisionIds: number[];
  title: string | null;
  active: boolean;
  Level?: { id: number; name: string } | null;
  User: { id: number; firstName: string; lastName: string; email?: string; dni?: string | null; avatar?: string | null; lastLogin?: string | null };
}

export const StaffTab = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSchool();
  const { user } = useAuth();
  // Roles que esta persona puede otorgar: los calcula el servidor (misma regla que aplica al guardar).
  const grantable = session?.grantableRoles ?? [];
  const [formError, setFormError] = useState('');
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
      else toast('La persona ya tenía cuenta: se le agregó el rol y conserva su contraseña.');
      setForm(null);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (e: Error) => setFormError(e.message),
  });
  const toggle = useMutation({
    mutationFn: (m: StaffRow) => apiSend('PATCH', `/school/staff/${m.id}`, { active: !m.active }),
    onSuccess: (_r, m) => (qc.invalidateQueries({ queryKey: ['staff'] }), toast(m.active ? 'Rol desactivado' : 'Rol activado')),
    onError: (e: Error) => toast(e.message, true),
  });

  const submit = (e: FormEvent) => (e.preventDefault(), create.mutate());
  const roles = Array.from(new Set(staff.data?.map((m) => m.role) ?? [])) as SchoolRole[];
  const list = staff.data?.filter((m) => !roleFilter || m.role === roleFilter) ?? [];

  return (
    <div className="stack">
      <div className="row-between wrap">
        <select className="select" style={{ maxWidth: 240 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as SchoolRole | '')}>
          <option value="">Todos los roles</option>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <div className="row" style={{ gap: 8 }}>
          {grantable.length > 0 && <StaffImportButton />}
          <button className="btn" disabled={!grantable.length} onClick={() => (setFormError(''), setForm({ firstName: '', lastName: '', email: '', dni: '', role: grantable.includes('DOCENTE') ? 'DOCENTE' : grantable[0], levelId: '', divisionIds: [], title: '' }))}><Plus size={18} /> Agregar</button>
        </div>
      </div>
      {staff.isLoading && <Skeleton count={6} h={56} />}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {list.map((m) => (
          <div key={m.id} className="list-item wrap" style={{ opacity: m.active ? 1 : 0.5 }}>
            <Link to={`/personas/${m.userId}`} className="row grow" style={{ minWidth: 200, color: 'inherit' }}>
              <Avatar name={`${m.User.firstName} ${m.User.lastName}`} src={m.User.avatar} size="sm" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="h3 truncate">{m.User.lastName}, {m.User.firstName}</div>
                <div className="xs muted truncate">{m.User.email?.endsWith('@sin-email.local') ? `DNI ${m.User.dni}` : m.User.email ?? m.roleLabel}{m.User.lastLogin === null ? ' · nunca ingresó' : ''}</div>
              </div>
              <Badge tone="info">{m.roleLabel}{m.Level ? ` · ${m.Level.name}` : ''}</Badge>
            </Link>
            {grantable.includes(m.role) && m.userId !== user?.userData.id && (
              <div className="row wrap" style={{ gap: 4 }}>
                {m.active && <ResetPasswordButton userId={m.userId} name={`${m.User.firstName} ${m.User.lastName}`} />}
                <button className="btn btn-sm btn-ghost" onClick={() => toggle.mutate(m)}>{m.active ? 'Desactivar' : 'Activar'}</button>
              </div>
            )}
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
                {grantable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
            {!form.email && !form.dni && <p className="field-error">Cargá el DNI o el email: es lo que usa para ingresar.</p>}
            {formError && <div className="alert alert-danger small">{formError}</div>}
            <button className="btn btn-block" disabled={create.isPending || (!form.email && !form.dni)}>{create.isPending ? 'Guardando…' : 'Guardar'}</button>
          </form>
        )}
      </Sheet>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} />
    </div>
  );
};
