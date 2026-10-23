import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, Users } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { Badge, Empty, ErrorBox, Field, PageHeader, Sheet, Skeleton, useToast, timeAgo, Avatar } from '../../ui';
import { CredentialsSheet, type Credential } from '../../school/CredentialsSheet';

interface Member { id: number; firstName: string; lastName: string; email: string; dni: string | null; lastLogin: string | null; createdAt: string; isActive: boolean }

/** Equipo Sentryx: quiénes tienen la consola. Se suman desde acá; quitar a alguien es solo por consola del servidor. */
export default function PlatformTeamPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['platform-superadmins'], queryFn: () => apiGet<Member[]>('/platform/superadmins') });
  const [form, setForm] = useState<{ firstName: string; lastName: string; email: string; dni: string } | null>(null);
  const [error, setError] = useState('');
  const [creds, setCreds] = useState<Credential[]>([]);
  const create = useMutation({
    mutationFn: () => apiSend<{ user: { firstName: string; lastName: string; email: string }; tempPassword: string | null }>('POST', '/platform/superadmins', { ...form!, dni: form!.dni || null }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['platform-superadmins'] });
      setForm(null);
      if (r.tempPassword) setCreds([{ name: `${r.user.firstName} ${r.user.lastName}`, login: r.user.email, tempPassword: r.tempPassword, email: r.user.email }]);
      else toast(`${r.user.firstName} ya tenía cuenta: ahora también es del equipo (conserva su contraseña).`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="stack-lg">
      <PageHeader title="Equipo Sentryx" subtitle="Quiénes tienen acceso a esta consola (superadmins)." actions={<button className="btn" onClick={() => (setError(''), setForm({ firstName: '', lastName: '', email: '', dni: '' }))}><Plus size={18} /> Agregar</button>} />
      <div className="alert alert-info small">Los superadmins ven y administran <b>todos</b> los colegios. Desde acá solo se suman personas; para quitar a alguien del equipo hay que hacerlo por consola del servidor (<code>npm run superadmin -- --email … --remove</code>), así nadie puede borrar a otro desde la web.</div>
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton count={3} h={60} />}
      {q.data && !q.data.length && <Empty icon={<Users size={36} strokeWidth={1.5} />} title="Todavía no hay superadmins" />}
      {!!q.data?.length && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {q.data.map((m) => (
            <div key={m.id} className="list-item">
              <Avatar name={`${m.firstName} ${m.lastName}`} size="sm" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="h3 truncate">{m.firstName} {m.lastName} <Badge tone="info"><ShieldCheck size={12} /> Superadmin</Badge></div>
                <div className="xs muted truncate">{m.email}{m.dni ? ` · DNI ${m.dni}` : ''} · {m.lastLogin ? `último ingreso ${timeAgo(m.lastLogin)}` : 'nunca ingresó'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title="Sumar al equipo">
        {form && (
          <form className="stack" onSubmit={(e: FormEvent) => (e.preventDefault(), create.mutate())}>
            <div className="grid grid-2">
              <Field label="Nombre"><input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Apellido"><input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            </div>
            <Field label="Email" hint="Recibe el acceso por mail. Si ya tiene cuenta en Sentryx, se le suma el rol y conserva su contraseña."><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="DNI (opcional)"><input className="input" inputMode="numeric" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
            {error && <div className="alert alert-danger small">{error}</div>}
            <button className="btn btn-accent btn-block" disabled={create.isPending || !form.firstName || !form.lastName || !form.email}>{create.isPending ? 'Sumando…' : 'Sumar como superadmin'}</button>
          </form>
        )}
      </Sheet>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} title="Acceso a la consola" />
    </div>
  );
}
