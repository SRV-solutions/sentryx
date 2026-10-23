/** Administración → Personal: una fila por persona con sus roles como etiquetas; "Editar" abre datos, roles y cargos con sueldo. */
import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiGet, apiSend } from '../../../lib/api';
import { useSchool } from '../../../school/SchoolContext';
import { Badge, ErrorBox, Field, Sheet, Skeleton, Tabs, timeAgo, useToast, Avatar } from '../../../ui';
import { ROLE_LABELS, type SchoolRole, type Structure } from '../../../school/types';
import type { CatalogRole } from '../../../school/CustomRolesEditor';
import { CredentialsSheet, type Credential } from '../../../school/CredentialsSheet';
import { ResetPasswordButton, exactDate, usePerson } from '../../../school/PersonProfile';
import { useAuth } from '../../../context/AuthContext';
import { Entity, Action } from '../../../school/permissions';
import { PlanGate } from '../../../school/PlanGate';
import { PlanFeature } from '../../../school/plans';
import { KIND_LABELS, SITUATION_LABELS, money, type PayMode } from '../../../school/staffRecords';
import type { StaffRecord } from '../StaffAdminPage';
import { PositionSheet, emptyForm, formOf, roleTitle, type PositionForm } from '../../../school/PositionSheet';
import { StaffImportButton } from './StaffImport';
import { ScheduleView } from '../../../school/ScheduleView';

export interface StaffRow {
  id: number;
  userId: number;
  role: string;
  roleLabel: string;
  levelId: number | null;
  divisionIds: number[];
  title: string | null;
  active: boolean;
  lastSeenAt?: string | null;
  Level?: { id: number; name: string } | null;
  User: { id: number; firstName: string; lastName: string; email?: string; dni?: string | null; avatar?: string | null; lastLogin?: string | null };
}

/** Una persona del personal con todos sus roles. */
interface StaffPerson {
  userId: number;
  User: StaffRow['User'];
  memberships: StaffRow[];
  lastSeenAt: string | null;
}

const realEmail = (email?: string) => (email && !email.endsWith('@sin-email.local') ? email : '');
const roleTag = (m: StaffRow) => `${m.roleLabel}${m.Level ? ` · ${m.Level.name}` : ''}`;
/** "Última conexión: hace 2 h (23 oct, 14:32)" o "Nunca ingresó". */
export const lastSeenText = (seen: string | null | undefined, lastLogin?: string | null) => {
  const d = seen ?? lastLogin;
  return d ? `Última conexión ${timeAgo(d)} (${exactDate(d)})` : 'Nunca ingresó';
};

type AddForm = { firstName: string; lastName: string; email: string; dni: string; role: string; levelId: number | ''; divisionIds: number[]; title: string; sendEmail?: boolean };

export const StaffTab = () => {
  const toast = useToast();
  const qc = useQueryClient();
  const { session, can } = useSchool();
  const { user } = useAuth();
  // Roles que esta persona puede otorgar: los calcula el servidor (misma regla que aplica al guardar).
  const grantable = session?.grantableRoles ?? [];
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => apiGet<StaffRow[]>('/school/staff') });
  const [form, setForm] = useState<AddForm | null>(null);
  const [formError, setFormError] = useState('');
  const [creds, setCreds] = useState<Credential[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<number | null>(null);

  const people = useMemo(() => {
    const map = new Map<number, StaffPerson>();
    for (const m of staff.data ?? []) {
      const p = map.get(m.userId) ?? { userId: m.userId, User: m.User, memberships: [], lastSeenAt: m.lastSeenAt ?? null };
      p.memberships.push(m);
      map.set(m.userId, p);
    }
    return [...map.values()];
  }, [staff.data]);
  const roles = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const m of staff.data ?? []) byCode.set(m.role, m.roleLabel);
    return [...byCode.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [staff.data]);
  const term = q.trim().toLowerCase();
  const list = people.filter(
    (p) =>
      (!roleFilter || p.memberships.some((m) => m.role === roleFilter)) &&
      (!term || `${p.User.firstName} ${p.User.lastName} ${p.User.email ?? ''} ${p.User.dni ?? ''}`.toLowerCase().includes(term))
  );
  const canEditPeople = can(Entity.USERS, Action.UPDATE) || can(Entity.STAFF_RECORDS, Action.READ);
  const person = people.find((p) => p.userId === editing) ?? null;

  const create = useMutation({
    mutationFn: () => apiSend<{ tempPassword: string | null; user: { firstName: string; lastName: string } }>('POST', '/school/staff', { ...form, email: form!.email || null, dni: form!.dni || null, levelId: form!.levelId || null, title: form!.title || null, sendEmail: form!.sendEmail !== false && !!form!.email }),
    onSuccess: (r) => {
      toast('Personal agregado');
      if (r.tempPassword) setCreds([{ name: `${r.user.firstName} ${r.user.lastName}`, login: form!.dni || form!.email, tempPassword: r.tempPassword, email: form!.sendEmail !== false && form!.email ? form!.email : null }]);
      else toast(`${r.user.firstName} ${r.user.lastName} ya tenía cuenta: se le sumó el rol y conserva su contraseña.`);
      setForm(null);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div className="row wrap" style={{ gap: 8, flex: '1 1 320px' }}>
          <input className="input" style={{ flex: '1 1 180px' }} placeholder="Buscar por nombre, email o DNI" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ maxWidth: 220 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Todos los roles</option>
            {roles.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {grantable.length > 0 && <StaffImportButton />}
          <button className="btn" disabled={!grantable.length} onClick={() => (setFormError(''), setForm({ firstName: '', lastName: '', email: '', dni: '', role: grantable.includes('DOCENTE') ? 'DOCENTE' : grantable[0], levelId: '', divisionIds: [], title: '' }))}><Plus size={18} /> Agregar</button>
        </div>
      </div>
      {staff.isLoading && <Skeleton count={6} h={64} />}
      {staff.error && <ErrorBox error={staff.error} />}
      {staff.data && <span className="xs muted">{list.length} {list.length === 1 ? 'persona' : 'personas'}</span>}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {list.map((p) => {
          const name = `${p.User.firstName} ${p.User.lastName}`;
          const active = p.memberships.some((m) => m.active);
          const manageable = p.userId !== user?.userData.id && p.memberships.some((m) => grantable.includes(m.role));
          return (
            <div key={p.userId} className="list-item wrap" style={{ opacity: active ? 1 : 0.55 }}>
              <Link to={`/personas/${p.userId}`} className="row grow" style={{ minWidth: 220, color: 'inherit', alignItems: 'flex-start' }}>
                <Avatar name={name} src={p.User.avatar} size="sm" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="h3 truncate">{p.User.lastName}, {p.User.firstName}</div>
                  <div className="xs muted truncate">{realEmail(p.User.email) || (p.User.dni ? `DNI ${p.User.dni}` : '')}</div>
                  <div className="xs muted">{lastSeenText(p.lastSeenAt, p.User.lastLogin)}</div>
                  <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                    {p.memberships.map((m) => (
                      <span key={m.id} title={m.active ? m.title ?? undefined : 'Rol desactivado'} style={{ opacity: m.active ? 1 : 0.6, textDecoration: m.active ? undefined : 'line-through' }}>
                        <Badge tone={m.active ? 'info' : undefined}>{roleTag(m)}</Badge>
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
              <div className="row wrap" style={{ gap: 4 }}>
                {canEditPeople && <button className="btn btn-sm btn-ghost" onClick={() => setEditing(p.userId)}><Pencil size={14} /> Editar</button>}
                {manageable && active && <ResetPasswordButton userId={p.userId} name={name} />}
              </div>
            </div>
          );
        })}
      </div>

      {person && <PersonEditSheet person={person} onClose={() => setEditing(null)} />}

      <Sheet open={!!form} onClose={() => setForm(null)} title="Agregar personal">
        {form && (
          <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), create.mutate())}>
            <div className="grid grid-2">
              <Field label="Nombre"><input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Apellido"><input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            </div>
            <Field label="Email" hint="Recibe acceso por email. Si no tiene, ingresa con DNI."><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="DNI"><input className="input" inputMode="numeric" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
            <RoleFields form={form} setForm={setForm} grantable={grantable} />
            <label className="row small" style={{ gap: 8, opacity: form.email ? 1 : 0.5 }} title={form.email ? '' : 'Cargá el email para poder enviárselo'}>
              <input type="checkbox" disabled={!form.email} checked={!!form.email && form.sendEmail !== false} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} />
              <span>Enviarle por mail los datos de acceso<span className="xs muted" style={{ display: 'block' }}>Le llega un botón para entrar directo y elegir su contraseña (sirve una vez, 7 días).</span></span>
            </label>
            <p className="xs muted">Si ya existe (mismo email o DNI), se le suma el rol a su cuenta. Después podés sumarle más roles desde Editar → Roles.</p>
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

/** Rol, nivel, divisiones (preceptoría) y cargo: compartido por "Agregar" y "Sumar otro rol". */
const RoleFields = <F extends Pick<AddForm, 'role' | 'levelId' | 'divisionIds' | 'title'>>({ form, setForm, grantable, exclude = [] }: { form: F; setForm: (f: F) => void; grantable: string[]; exclude?: string[] }) => {
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const catalog = useQuery({ queryKey: ['role-catalog'], queryFn: () => apiGet<{ roles: CatalogRole[] }>('/school/roles'), staleTime: 5 * 60_000 });
  const labelOf = (code: string) => catalog.data?.roles.find((r) => r.code === code)?.name ?? ROLE_LABELS[code as SchoolRole] ?? code;
  return (
    <>
      <Field label="Rol">
        <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {grantable.filter((r) => !exclude.includes(r) || r === form.role).map((r) => <option key={r} value={r}>{labelOf(r)}</option>)}
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
    </>
  );
};

type EditTab = 'datos' | 'roles' | 'sueldo';

/** Editar a una persona del personal: datos, roles y cargos con su sueldo. */
const PersonEditSheet = ({ person, onClose }: { person: StaffPerson; onClose: () => void }) => {
  const { can } = useSchool();
  const showRecords = can(Entity.STAFF_RECORDS, Action.READ);
  const [tab, setTab] = useState<EditTab>(showRecords ? 'sueldo' : 'roles');
  const name = `${person.User.firstName} ${person.User.lastName}`;
  const items: Array<{ value: EditTab; label: string }> = [
    { value: 'datos', label: 'Datos' },
    { value: 'roles', label: `Roles (${person.memberships.length})` },
    ...(showRecords ? [{ value: 'sueldo' as const, label: 'Cargos y sueldo' }] : []),
  ];
  return (
    <Sheet open onClose={onClose} title={name}>
      <div className="stack">
        <p className="xs muted" style={{ marginTop: -8 }}>{lastSeenText(person.lastSeenAt, person.User.lastLogin)}</p>
        <Tabs value={tab} onChange={setTab} items={items} />
        {tab === 'datos' && <DataTab userId={person.userId} />}
        {tab === 'roles' && <RolesTab person={person} />}
        {tab === 'sueldo' && (
          <PlanGate feature={PlanFeature.STAFF_RECORDS} title="Cargos, horas y sueldo">
            <PayTab person={person} />
          </PlanGate>
        )}
      </div>
    </Sheet>
  );
};

const DataTab = ({ userId }: { userId: number }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const p = usePerson(userId);
  const [form, setForm] = useState<{ firstName: string; lastName: string; dni: string; email: string; phone: string } | null>(null);
  const [error, setError] = useState('');
  if (p.data && !form) setForm({ firstName: p.data.firstName, lastName: p.data.lastName, dni: p.data.contact?.dni ?? '', email: realEmail(p.data.contact?.email ?? undefined), phone: p.data.contact?.phone ?? '' });
  const save = useMutation({
    mutationFn: () => apiSend('PATCH', `/school/people/${userId}`, form),
    onSuccess: () => {
      toast('Datos actualizados');
      for (const key of [['person', userId], ['people'], ['staff'], ['staff-records']]) qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => setError(e.message),
  });
  if (p.isLoading || !form) return <Skeleton count={4} h={44} />;
  if (p.error) return <ErrorBox error={p.error} />;
  const editable = !!p.data?.canManage;
  return (
    <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), setError(''), !form.dni.trim() && !form.email.trim() ? setError('Cargá el DNI o el email: es lo que usa para ingresar.') : save.mutate())}>
      {!editable && <div className="alert alert-info small">Solo podés ver estos datos: los modifica quien administra a esta persona.</div>}
      <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="grid grid-2">
          <Field label="Nombre"><input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
          <Field label="Apellido"><input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        </div>
        <Field label="DNI" hint="Con DNI puede ingresar aunque no tenga email."><input className="input" inputMode="numeric" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Teléfono"><input className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      </fieldset>
      {p.data?.account && (
        <p className="xs muted">
          Ingresa con <b>{p.data.account.login}</b> · Último ingreso: {p.data.account.lastLogin ? `${timeAgo(p.data.account.lastLogin)} (${exactDate(p.data.account.lastLogin)})` : 'nunca'}
        </p>
      )}
      {error && <div className="alert alert-danger small">{error}</div>}
      {editable && <button className="btn btn-block" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar datos'}</button>}
    </form>
  );
};

const RolesTab = ({ person }: { person: StaffPerson }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSchool();
  const { user } = useAuth();
  const grantable = session?.grantableRoles ?? [];
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => apiGet<Structure>('/school/structure'), staleTime: 5 * 60_000 });
  const self = person.userId === user?.userData.id;
  const selfGrantable = session?.selfGrantableRoles ?? [];
  const canEditRole = (role: string) => grantable.includes(role) && (!self || selfGrantable.includes(role));
  const [adding, setAdding] = useState<Pick<AddForm, 'role' | 'levelId' | 'divisionIds' | 'title'> | null>(null);
  const [error, setError] = useState('');
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiSend('PATCH', `/school/staff/${id}`, body),
    onSuccess: () => (toast('Rol actualizado'), qc.invalidateQueries({ queryKey: ['staff'] }), qc.invalidateQueries({ queryKey: ['person', person.userId] })),
    onError: (e: Error) => toast(e.message, true),
  });
  const add = useMutation({
    mutationFn: () =>
      apiSend('POST', '/school/staff', {
        firstName: person.User.firstName,
        lastName: person.User.lastName,
        email: realEmail(person.User.email) || null,
        dni: person.User.dni || null,
        ...adding,
        levelId: adding!.levelId || null,
        title: adding!.title || null,
      }),
    onSuccess: () => (toast('Rol sumado: sus permisos se suman y conserva su contraseña.'), setAdding(null), qc.invalidateQueries({ queryKey: ['staff'] }), qc.invalidateQueries({ queryKey: ['person', person.userId] })),
    onError: (e: Error) => setError(e.message),
  });
  const owned = person.memberships.filter((m) => m.active).map((m) => m.role);
  const addable = grantable.filter((r) => !owned.includes(r) && (!self || selfGrantable.includes(r)));
  return (
    <div className="stack">
      <p className="xs muted">Una persona puede tener varios roles (ej: Rectoría y Representante Legal, o Secretaría y Preceptoría): sus permisos se suman y usa la misma cuenta. Cada rol puede tener su propio cargo y sueldo en “Cargos y sueldo”.</p>
      {self && <div className="alert alert-info small">{selfGrantable.length === grantable.length ? 'Podés ponerte y sacarte cualquier rol.' : 'Tus roles de conducción los modifica otra autoridad. Sí podés sumarte o sacarte roles de menor jerarquía (ej: Docente).'}</div>}
      {person.memberships.map((m) => {
        const editable = canEditRole(m.role);
        return (
          <div key={m.id} className="card stack" style={{ padding: 12, gap: 8, opacity: m.active ? 1 : 0.6 }}>
            <div className="row-between wrap">
              <span><b>{m.roleLabel}</b>{m.title && <span className="small muted"> · {m.title}</span>}</span>
              <Badge tone={m.active ? 'ok' : undefined}>{m.active ? 'Activo' : 'Desactivado'}</Badge>
            </div>
            {editable ? (
              <>
                {m.role !== 'DOCENTE' && (
                  <Field label="Nivel a cargo">
                    <select className="select" value={m.levelId ?? ''} disabled={patch.isPending} onChange={(e) => patch.mutate({ id: m.id, body: { levelId: e.target.value ? Number(e.target.value) : null } })}>
                      <option value="">Toda la institución</option>
                      {structure.data?.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </Field>
                )}
                {m.role === 'PRECEPTOR' && (
                  <Field label="Divisiones a cargo" hint="Vacío = todas las del nivel">
                    <div className="chips" style={{ flexWrap: 'wrap' }}>
                      {structure.data?.divisions
                        .filter((d) => !m.levelId || d.levelId === m.levelId)
                        .map((d) => {
                          const on = m.divisionIds.includes(d.id);
                          return (
                            <button type="button" key={d.id} disabled={patch.isPending} className={`chip ${on ? 'active' : ''}`} onClick={() => patch.mutate({ id: m.id, body: { divisionIds: on ? m.divisionIds.filter((x) => x !== d.id) : [...m.divisionIds, d.id] } })}>
                              {d.name}
                            </button>
                          );
                        })}
                    </div>
                  </Field>
                )}
                <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} disabled={patch.isPending} onClick={() => patch.mutate({ id: m.id, body: { active: !m.active } })}>
                  {m.active ? 'Desactivar este rol' : 'Activar este rol'}
                </button>
              </>
            ) : (
              <span className="xs muted">{m.Level ? `Nivel: ${m.Level.name}. ` : ''}Este rol lo administra otra autoridad.</span>
            )}
          </div>
        );
      })}
      {addable.length > 0 && !adding && (
        <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => (setError(''), setAdding({ role: addable[0], levelId: '', divisionIds: [], title: '' }))}><Plus size={14} /> Sumar otro rol</button>
      )}
      {adding && (
        <form className="card stack" style={{ padding: 12 }} onSubmit={(e: FormEvent) => (e.preventDefault(), add.mutate())}>
          <b className="small">Nuevo rol</b>
          <RoleFields form={adding} setForm={setAdding} grantable={self ? grantable.filter((r) => selfGrantable.includes(r)) : grantable} exclude={owned} />
          {error && <div className="alert alert-danger small">{error}</div>}
          <div className="row">
            <button type="button" className="btn btn-ghost grow" onClick={() => setAdding(null)}>Cancelar</button>
            <button className="btn grow" disabled={add.isPending}>{add.isPending ? 'Guardando…' : 'Sumar rol'}</button>
          </div>
        </form>
      )}
    </div>
  );
};

const PAY_SHORT: Record<PayMode, string> = { NONE: '', HORA_CATEDRA: 'por hora cátedra', HORA_RELOJ: 'por hora trabajada', MENSUAL: 'monto fijo' };

const PayTab = ({ person }: { person: StaffPerson }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSchool();
  const canEdit = can(Entity.STAFF_RECORDS, Action.UPDATE);
  const seesPay = can(Entity.PAYROLL, Action.READ);
  const record = useQuery({ queryKey: ['staff-records', person.userId], queryFn: () => apiGet<StaffRecord[]>(`/school/staff-records?userId=${person.userId}`) });
  const [form, setForm] = useState<PositionForm | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => apiSend('DELETE', `/school/staff-positions/${id}`),
    onSuccess: () => (toast('Cargo eliminado'), qc.invalidateQueries({ queryKey: ['staff-records'] })),
    onError: (e: Error) => toast(e.message, true),
  });
  if (record.isLoading) return <Skeleton count={3} h={56} />;
  if (record.error) return <ErrorBox error={record.error} />;
  const r = record.data?.find((x) => x.userId === person.userId);
  const positions = r?.positions ?? [];
  const active = positions.filter((p) => p.active);
  const name = `${person.User.firstName} ${person.User.lastName}`;
  /** Un cargo nuevo arranca con los datos del rol (ej: "Rectoría" en Secundario). */
  const fromRole = (m: StaffRow): PositionForm => ({ ...emptyForm(person.userId), title: roleTitle({ roleLabel: m.roleLabel, level: m.Level?.name }), kind: m.role === 'DOCENTE' ? 'HORAS_CATEDRA' : 'CARGO', levelId: m.levelId ?? '', payMode: m.role === 'DOCENTE' ? 'HORA_CATEDRA' : 'MENSUAL' });
  const uncovered = person.memberships.filter((m) => m.active && !active.some((p) => p.title === roleTitle({ roleLabel: m.roleLabel, level: m.Level?.name }) || p.title === m.title));
  return (
    <div className="stack">
      <div className="card" style={{ padding: 12, background: 'var(--surface-2)' }}>
        <div className="row-between wrap" style={{ gap: 8 }}>
          <div>
            <div className="xs muted">Horas semanales</div>
            <div className="h2">{r?.weeklyHours ?? 0} h</div>
          </div>
          {seesPay && (
            <div style={{ textAlign: 'right' }}>
              <div className="xs muted">Cobra por mes (bruto)</div>
              <div className="h2">{money(r?.monthlyPay ?? 0)}</div>
            </div>
          )}
        </div>
        {seesPay && active.length > 1 && <div className="xs muted" style={{ marginTop: 6 }}>Es la suma de sus {active.length} cargos activos: cada uno con su propio sueldo.</div>}
        {!seesPay && <div className="xs muted" style={{ marginTop: 6 }}>Los montos los ven y cargan la Representante Legal y Administración.</div>}
      </div>

      {!positions.length && <p className="small muted">Todavía no tiene cargos ni horas cargados.</p>}
      {positions.map((p) => (
        <div key={p.id} className="card stack" style={{ padding: 12, gap: 6, opacity: p.active ? 1 : 0.55 }}>
          <div className="row-between wrap" style={{ gap: 6 }}>
            <b>{p.title}</b>
            {canEdit && (
              <div className="row" style={{ gap: 2 }}>
                <button className="icon-btn" aria-label="Editar cargo" onClick={() => setForm(formOf(p))}><Pencil size={15} /></button>
                <button className="icon-btn" aria-label="Eliminar cargo" disabled={remove.isPending} onClick={() => window.confirm(`¿Eliminar el cargo "${p.title}"?`) && remove.mutate(p.id)}><Trash2 size={15} /></button>
              </div>
            )}
          </div>
          <div className="row wrap" style={{ gap: 4 }}>
            <Badge>{KIND_LABELS[p.kind]} · {p.weeklyHours} h</Badge>
            <Badge tone="ok">{SITUATION_LABELS[p.situation]}</Badge>
            {p.shift && <Badge>{p.shift}</Badge>}
            {!p.active && <Badge>Inactivo</Badge>}
          </div>
          {seesPay && (
            p.payMode && p.payMode !== 'NONE' ? (
              <div className="small">
                <b>{money(p.monthlyPay ?? 0)} por mes</b>
                <span className="xs muted"> · {PAY_SHORT[p.payMode]}{p.payMode === 'MENSUAL' ? '' : `: ${p.weeklyHours} h${p.payMode === 'HORA_RELOJ' ? ' × 4,33 semanas' : ''} × ${money(p.rate ?? 0)}`}</span>
              </div>
            ) : (
              <span className="xs muted">Sueldo sin cargar{canEdit ? ': tocá el lápiz para cargar el valor hora o el monto.' : '.'}</span>
            )
          )}
        </div>
      ))}

      {canEdit && (
        <div className="row wrap" style={{ gap: 6 }}>
          {uncovered.map((m) => (
            <button key={m.id} className="btn btn-sm btn-ghost" onClick={() => setForm(fromRole(m))}><Plus size={14} /> Cargo de {roleTag(m)}</button>
          ))}
          <button className="btn btn-sm" onClick={() => setForm(emptyForm(person.userId))}><Plus size={14} /> Agregar cargo u horas</button>
        </div>
      )}
      {active.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <b className="small">Horario</b>
          <ScheduleView positions={active} />
        </div>
      )}
      {r && !r.seesOwnRecords && <div className="alert alert-info xs">Con su plan, esta persona no ve su legajo ni lo que cobra. Podés cambiarle el plan en <Link to="/planes">Planes</Link>.</div>}
      <PositionSheet form={form} onClose={() => setForm(null)} personName={name} />
    </div>
  );
};
