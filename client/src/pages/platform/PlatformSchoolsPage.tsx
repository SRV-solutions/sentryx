import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Copy, ExternalLink, Users, GraduationCap } from 'lucide-react';
import { apiGet, apiSend, setSchoolId } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Badge, Empty, ErrorBox, Field, PageHeader, Sheet, Skeleton, useToast, fmtDate } from '../../ui';
import { CredentialsSheet, type Credential } from '../../school/CredentialsSheet';
import type { LevelType } from '../../school/types';

interface SchoolRow {
  id: number;
  name: string;
  slug: string;
  cue: string | null;
  active: boolean;
  createdAt: string;
  levels: string[] | null;
  activeUsers: number;
  students: number;
  estimatedMonthly: number;
  legalReps: Array<{ id: number; name: string; email: string | null; lastLogin: string | null }>;
}

const ars = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const slugify = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const LEVELS: Array<[LevelType, string]> = [['INICIAL', 'Inicial'], ['PRIMARIO', 'Primario'], ['SECUNDARIO', 'Secundario']];

const NewSchoolSheet = ({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Credential[], url: string) => void }) => {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', slug: '', cue: '', levels: ['INICIAL', 'PRIMARIO', 'SECUNDARIO'] as LevelType[], year: new Date().getFullYear(), first: '', last: '', email: '', dni: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () =>
      apiSend<{ loginUrl: string; legalRep: { name: string; login: string; tempPassword: string | null; email: string | null } }>('POST', '/platform/schools', {
        name: f.name, slug: f.slug, cue: f.cue || null, levels: f.levels, year: f.year,
        admin: { firstName: f.first, lastName: f.last, email: f.email, dni: f.dni || null },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['platform-schools'] });
      qc.invalidateQueries({ queryKey: ['schools'] });
      onCreated(r.legalRep.tempPassword ? [{ name: r.legalRep.name, login: r.legalRep.login, tempPassword: r.legalRep.tempPassword, email: r.legalRep.email }] : [], r.loginUrl);
    },
    onError: (e: Error) => setError(e.message),
  });
  const submit = (e: FormEvent) => (e.preventDefault(), setError(''), create.mutate());
  return (
    <Sheet open onClose={onClose} title="Nuevo colegio">
      <form className="stack" onSubmit={submit}>
        <Field label="Nombre del colegio"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })} placeholder="Ej: Colegio Divina Providencia" /></Field>
        <div className="grid grid-2">
          <Field label="Identificador (link de ingreso)" hint={`app…/c/${f.slug || 'mi-colegio'}`}>
            <input className="input" required value={f.slug} onChange={(e) => (setSlugTouched(true), setF({ ...f, slug: slugify(e.target.value) }))} />
          </Field>
          <Field label="CUE (opcional)"><input className="input" value={f.cue} onChange={(e) => setF({ ...f, cue: e.target.value })} /></Field>
        </div>
        <Field label="Niveles">
          <div className="chips">
            {LEVELS.map(([v, l]) => (
              <button type="button" key={v} className={`chip ${f.levels.includes(v) ? 'active' : ''}`} onClick={() => setF({ ...f, levels: f.levels.includes(v) ? f.levels.filter((x) => x !== v) : [...f.levels, v] })}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="Ciclo lectivo"><input className="input" type="number" min={2020} max={2100} value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) })} /></Field>
        <h3 className="h3">Representante Legal</h3>
        <p className="xs muted">Es la máxima autoridad del colegio en Sentryx: desde su cuenta carga al resto del personal y a las familias.</p>
        <div className="grid grid-2">
          <Field label="Nombre"><input className="input" required value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} /></Field>
          <Field label="Apellido"><input className="input" required value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="DNI (opcional)"><input className="input" inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} /></Field>
        </div>
        {error && <div className="alert alert-danger small">{error}</div>}
        <button className="btn btn-accent btn-block" disabled={create.isPending || !f.levels.length}>{create.isPending ? 'Creando…' : 'Crear colegio'}</button>
      </form>
    </Sheet>
  );
};

/** Consola del equipo Sentryx: todos los colegios de la plataforma. */
export default function PlatformSchoolsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { switchSchool } = useSchool();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [creds, setCreds] = useState<Credential[]>([]);
  const q = useQuery({ queryKey: ['platform-schools'], queryFn: () => apiGet<SchoolRow[]>('/platform/schools') });
  const toggle = useMutation({
    mutationFn: (s: SchoolRow) => apiSend('PATCH', `/platform/schools/${s.id}`, { active: !s.active }),
    onSuccess: (_r, s) => (qc.invalidateQueries({ queryKey: ['platform-schools'] }), toast(s.active ? 'Colegio suspendido' : 'Colegio reactivado')),
    onError: (e: Error) => toast(e.message, true),
  });
  const link = (slug: string) => `${window.location.origin}/c/${slug}`;
  const enter = (s: SchoolRow) => {
    setSchoolId(s.id);
    switchSchool(s.id);
    navigate('/inicio');
  };

  return (
    <div className="stack-lg">
      <PageHeader
        title="Colegios"
        subtitle="Plataforma Sentryx · cada colegio es un espacio propio con sus niveles, personas y datos."
        actions={<button className="btn" onClick={() => setCreating(true)}><Plus size={18} /> Nuevo colegio</button>}
      />
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton count={3} h={120} />}
      {q.data && !q.data.length && <Empty icon={<Building2 size={36} strokeWidth={1.5} />} title="Todavía no hay colegios" action={<button className="btn" onClick={() => setCreating(true)}>Dar de alta el primero</button>} />}
      <div className="grid grid-auto">
        {q.data?.map((s) => (
          <div key={s.id} className="card card-pad stack" style={{ opacity: s.active ? 1 : 0.6 }}>
            <div className="row-between">
              <div className="h3">{s.name}</div>
              {!s.active && <Badge tone="danger">Suspendido</Badge>}
            </div>
            <div className="xs muted">{(s.levels ?? []).join(' · ') || 'Sin niveles'}{s.cue ? ` · CUE ${s.cue}` : ''} · alta {fmtDate(s.createdAt)}</div>
            <div className="row wrap" style={{ gap: 6 }}>
              <Badge tone="info"><Users size={12} /> {s.activeUsers} usuarios activos</Badge>
              <Badge><GraduationCap size={12} /> {s.students} alumnos</Badge>
              <Badge tone="accent">{ars(s.estimatedMonthly)}/mes</Badge>
            </div>
            <div className="small">
              <span className="muted">Representante Legal: </span>
              {s.legalReps.length ? s.legalReps.map((r) => `${r.name}${r.lastLogin ? '' : ' (nunca ingresó)'}`).join(', ') : <b style={{ color: 'var(--danger)' }}>sin asignar</b>}
            </div>
            <div className="row">
              <input className="input grow" readOnly value={link(s.slug)} onFocus={(e) => e.target.select()} aria-label="Link de ingreso" style={{ fontSize: 13 }} />
              <button className="icon-btn" aria-label="Copiar link" onClick={() => navigator.clipboard.writeText(link(s.slug)).then(() => toast('Link copiado'))}><Copy size={16} /></button>
            </div>
            <div className="row wrap">
              <button className="btn btn-sm" onClick={() => enter(s)} disabled={!s.active}><ExternalLink size={14} /> Entrar al colegio</button>
              <button className="btn btn-sm btn-ghost" onClick={() => toggle.mutate(s)}>{s.active ? 'Suspender' : 'Reactivar'}</button>
            </div>
          </div>
        ))}
      </div>
      {creating && (
        <NewSchoolSheet
          onClose={() => setCreating(false)}
          onCreated={(c, url) => {
            setCreating(false);
            toast(`Colegio creado · link: ${url}`);
            setCreds(c);
          }}
        />
      )}
      <CredentialsSheet items={creds} onClose={() => setCreds([])} title="Acceso de la Representante Legal" />
    </div>
  );
}
