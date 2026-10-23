import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Mail, Phone, IdCard, Pencil, BookOpen, Baby, ShieldCheck, Clock, MessageCircle, ChevronRight } from 'lucide-react';
import { apiGet, apiSend } from '../lib/api';
import { Avatar, Badge, Card, ErrorBox, Field, Sheet, Skeleton, timeAgo, useToast, fmtDate } from '../ui';
import { CredentialsSheet, type Credential } from './CredentialsSheet';
import type { SchoolRole } from './types';

export interface PersonDetail {
  id: number;
  firstName: string;
  lastName: string;
  avatar: string | null;
  biography: string | null;
  roles: Array<{ membershipId: number; role: SchoolRole; roleLabel: string; level: string | null; title: string | null; active: boolean }>;
  isGuardian: boolean;
  isStaff: boolean;
  isStudent: boolean;
  studentId: number | null;
  accessActive: boolean;
  children: Array<{ id: number; firstName: string; lastName?: string; relationship: string; isPrimary?: boolean; canPickUp?: boolean; division?: { id: number; name: string; level: string } | null }>;
  teaching: Array<{ division: { id: number; name: string; level?: string }; subject: { id: number; name: string } }>;
  contact: { email: string | null; phone: string | null; dni: string | null } | null;
  account: { lastLogin: string | null; lastSeenAt?: string | null; mustChangePassword: boolean; isActive: boolean; login: string } | null;
  visibility: 'self' | 'staff' | 'limited';
  canManage: boolean;
}

export const usePerson = (userId: number | null) =>
  useQuery({ queryKey: ['person', userId], queryFn: () => apiGet<PersonDetail>(`/school/people/${userId}`), enabled: !!userId });

const roleSummary = (p: PersonDetail) => [
  ...p.roles.filter((r) => r.active).map((r) => r.title || `${r.roleLabel}${r.level ? ` · ${r.level}` : ''}`),
  ...(p.isGuardian ? ['Familia'] : []),
  ...(p.isStudent ? ['Estudiante'] : []),
];

/** Desactivar / reactivar el acceso a este colegio (baja lógica, cuenta para la facturación del mes). */
const AccessToggle = ({ p }: { p: PersonDetail }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const m = useMutation({
    mutationFn: (active: boolean) => apiSend('PATCH', `/school/people/${p.id}/access`, { active }),
    onSuccess: (_r, active) => {
      setConfirm(false);
      toast(active ? 'Acceso reactivado' : 'Acceso desactivado');
      qc.invalidateQueries({ queryKey: ['person', p.id] });
      qc.invalidateQueries({ queryKey: ['people'] });
      qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });
  if (!p.accessActive) return <button className="btn btn-sm btn-ghost" onClick={() => m.mutate(true)} disabled={m.isPending}>Reactivar acceso</button>;
  return (
    <>
      <button className="btn btn-sm btn-ghost" onClick={() => setConfirm(true)}>Desactivar acceso</button>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Desactivar acceso">
        <div className="stack">
          <p className="small">
            <b>{p.firstName} {p.lastName}</b> deja de poder entrar a este colegio{p.isGuardian ? ' y de recibir comunicados' : ''}. No se borra nada: se puede reactivar cuando quieras.
          </p>
          <p className="xs muted">Facturación: este mes se cobra igual porque estuvo activo/a; deja de cobrarse desde el mes siguiente.</p>
          <div className="row">
            <button className="btn btn-ghost grow" onClick={() => setConfirm(false)}>Cancelar</button>
            <button className="btn btn-danger grow" disabled={m.isPending} onClick={() => m.mutate(false)}>Desactivar</button>
          </div>
        </div>
      </Sheet>
    </>
  );
};

/** "23 oct, 14:32": fecha y hora exactas para el registro de conexión. */
export const exactDate = (d: string) => fmtDate(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Estado de la cuenta en palabras (para administración). */
export const accountStatus = (a: { lastLogin: string | null; mustChangePassword: boolean; isActive?: boolean }) =>
  a.isActive === false
    ? { tone: 'danger' as const, text: 'Cuenta desactivada' }
    : !a.lastLogin
      ? { tone: 'warn' as const, text: 'Nunca ingresó' }
      : a.mustChangePassword
        ? { tone: 'warn' as const, text: 'Debe cambiar la contraseña' }
        : { tone: 'ok' as const, text: `Último ingreso ${timeAgo(a.lastLogin)}` };

const EditPersonSheet = ({ p, onClose }: { p: PersonDetail; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ firstName: p.firstName, lastName: p.lastName, dni: p.contact?.dni ?? '', email: p.contact?.email ?? '', phone: p.contact?.phone ?? '' });
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => apiSend('PATCH', `/school/people/${p.id}`, form),
    onSuccess: () => {
      toast('Datos actualizados');
      qc.invalidateQueries({ queryKey: ['person', p.id] });
      qc.invalidateQueries({ queryKey: ['people'] });
      qc.invalidateQueries({ queryKey: ['student'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.dni.trim() && !form.email.trim()) return setError('Cargá el DNI o el email: es lo que usa para ingresar.');
    save.mutate();
  };
  return (
    <Sheet open onClose={onClose} title="Editar datos">
      <form className="stack" onSubmit={submit}>
        <div className="grid grid-2">
          <Field label="Nombre"><input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
          <Field label="Apellido"><input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        </div>
        <Field label="DNI" hint="Con DNI puede ingresar aunque no tenga email."><input className="input" inputMode="numeric" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Teléfono"><input className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        {error && <div className="alert alert-danger small">{error}</div>}
        <button className="btn btn-block" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Sheet>
  );
};

/** Botón + confirmación para blanquear la contraseña de otra persona. */
export const ResetPasswordButton = ({ userId, name, block, onDone }: { userId: number; name: string; block?: boolean; onDone?: () => void }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [creds, setCreds] = useState<Credential[]>([]);
  const reset = useMutation({
    mutationFn: () => apiSend<{ name: string; login: string; tempPassword: string; emailed: boolean }>('POST', `/school/people/${userId}/reset-password`),
    onSuccess: (r) => {
      setConfirm(false);
      setCreds([{ name: r.name, login: r.login, tempPassword: r.tempPassword, email: r.emailed ? 'sí' : null }]);
      qc.invalidateQueries({ queryKey: ['person', userId] });
      qc.invalidateQueries({ queryKey: ['people'] });
      onDone?.();
    },
    onError: (e: Error) => toast(e.message, true),
  });
  return (
    <>
      <button className={`btn btn-sm btn-ghost ${block ? 'btn-block' : ''}`} onClick={() => setConfirm(true)}><KeyRound size={16} /> Blanquear contraseña</button>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Blanquear contraseña">
        <div className="stack">
          <p className="small">
            Se genera una <b>contraseña temporal</b> para <b>{name}</b> y su contraseña actual deja de funcionar. Al ingresar se le pedirá elegir una nueva.
            Si tiene email se la enviamos; si no, te la mostramos para que se la entregues.
          </p>
          <div className="row">
            <button className="btn btn-ghost grow" onClick={() => setConfirm(false)}>Cancelar</button>
            <button className="btn btn-accent grow" onClick={() => reset.mutate()} disabled={reset.isPending}>{reset.isPending ? 'Generando…' : 'Blanquear'}</button>
          </div>
        </div>
      </Sheet>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} title="Nueva contraseña temporal" />
    </>
  );
};

/**
 * Ficha de una persona (familia o personal). Se usa en el directorio, en la ficha del alumno y
 * desde los chats. Qué datos aparecen lo decide el servidor según quién mira.
 */
export const PersonProfile = ({ userId, onNavigate }: { userId: number; onNavigate?: () => void }) => {
  const q = usePerson(userId);
  const [editing, setEditing] = useState(false);
  if (q.isLoading) return <Skeleton count={3} h={80} />;
  if (q.error) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const p = q.data!;
  const name = `${p.firstName} ${p.lastName}`;
  const status = p.account ? accountStatus(p.account) : null;
  const staffView = p.visibility === 'staff';

  return (
    <div className="stack">
      <div className="profile-hero">
        <div className="profile-cover" />
        <div className="profile-body">
          <Avatar name={name} src={p.avatar} size="xl" />
          <h2 className="h2">{name}</h2>
          <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}>
            {roleSummary(p).map((r) => <Badge key={r} tone="info">{r}</Badge>)}
            {!p.accessActive && <Badge tone="danger">Acceso desactivado</Badge>}
            {status && p.accessActive && p.visibility !== 'self' && <Badge tone={status.tone}>{status.text}</Badge>}
          </div>
          {p.biography && <p className="small muted" style={{ maxWidth: 460, whiteSpace: 'pre-wrap' }}>{p.biography}</p>}
        </div>
      </div>

      {p.contact && (
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <div className="row-between">
              <h3 className="h3">Contacto</h3>
              {p.canManage && <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>}
            </div>
            {p.contact.phone && <a className="row small" href={`tel:${p.contact.phone}`}><Phone size={16} /> {p.contact.phone}</a>}
            {p.contact.email && <a className="row small" href={`mailto:${p.contact.email}`}><Mail size={16} /> {p.contact.email}</a>}
            {p.contact.dni && <div className="row small"><IdCard size={16} className="muted" /> DNI {p.contact.dni}</div>}
            {!p.contact.phone && !p.contact.email && <div className="small muted">Sin teléfono ni email cargados.</div>}
          </div>
        </Card>
      )}

      {p.children.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3 className="h3 row"><Baby size={18} /> {p.visibility === 'self' ? 'Mis hijos' : 'Hijos/as'}</h3>
          <div className="card list" style={{ overflow: 'hidden' }}>
            {p.children.map((c) => {
              const to = p.visibility === 'self' ? `/familia/${c.id}` : staffView ? `/alumnos/${c.id}` : null;
              const body = (
                <>
                  <Avatar name={`${c.firstName} ${c.lastName ?? ''}`} size="sm" />
                  <div className="grow">
                    <div className="h3">{c.firstName} {c.lastName}</div>
                    <div className="xs muted">{[c.relationship, c.division && `${c.division.name} · ${c.division.level}`].filter(Boolean).join(' · ')}</div>
                  </div>
                  {c.isPrimary && <Badge tone="info">Principal</Badge>}
                  {to && <ChevronRight size={16} className="muted" />}
                </>
              );
              return to ? <Link key={c.id} to={to} className="list-item" onClick={onNavigate}>{body}</Link> : <div key={c.id} className="list-item">{body}</div>;
            })}
          </div>
        </section>
      )}

      {p.teaching.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3 className="h3 row"><BookOpen size={18} /> Materias</h3>
          <div className="card list" style={{ overflow: 'hidden' }}>
            {p.teaching.map((t) => (
              <div key={`${t.division.id}-${t.subject.id}`} className="list-item">
                <div className="grow">
                  <div className="h3">{t.subject.name}</div>
                  <div className="xs muted">{t.division.name}{t.division.level ? ` · ${t.division.level}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.visibility !== 'self' && p.account && (
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <h3 className="h3 row"><ShieldCheck size={18} /> Cuenta</h3>
            <dl className="kv">
              <dt>Usuario</dt><dd>{p.account.login.endsWith('@sin-email.local') ? p.contact?.dni ?? '—' : p.account.login}</dd>
              <dt>Último ingreso</dt><dd className="row" style={{ gap: 6 }}><Clock size={14} className="muted" /> {p.account.lastLogin ? `${timeAgo(p.account.lastLogin)} · ${exactDate(p.account.lastLogin)}` : 'Nunca'}</dd>
              <dt>Última conexión</dt><dd>{p.account.lastSeenAt ? `${timeAgo(p.account.lastSeenAt)} · ${exactDate(p.account.lastSeenAt)}` : 'Nunca'}</dd>
            </dl>
            {p.canManage ? (
              <div className="row wrap">
                {p.accessActive && <ResetPasswordButton userId={p.id} name={name} />}
                <AccessToggle p={p} />
                {!p.contact && <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Editar datos</button>}
              </div>
            ) : (
              <p className="xs muted">Solo una autoridad de mayor jerarquía puede blanquear esta cuenta.</p>
            )}
          </div>
        </Card>
      )}

      {staffView && p.isStudent && p.studentId && (
        <Link to={`/alumnos/${p.studentId}?tab=datos`} className="btn btn-ghost btn-block" onClick={onNavigate}>Ver ficha del alumno</Link>
      )}

      {staffView && p.isGuardian && p.children[0] && (
        <Link to={`/mensajes/nuevo?alumno=${p.children[0].id}`} className="btn btn-ghost btn-block" onClick={onNavigate}><MessageCircle size={16} /> Escribirle por {p.children[0].firstName}</Link>
      )}

      {editing && <EditPersonSheet p={p} onClose={() => setEditing(false)} />}
    </div>
  );
};

/** La ficha dentro de una hoja deslizable (chats, listas). */
export const PersonSheet = ({ userId, onClose }: { userId: number | null; onClose: () => void }) => (
  <Sheet open={!!userId} onClose={onClose} title="Perfil">
    {userId && <PersonProfile userId={userId} onNavigate={onClose} />}
  </Sheet>
);
