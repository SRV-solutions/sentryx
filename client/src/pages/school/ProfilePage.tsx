import { FormEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2, Moon, Sun, Bell, LogOut, KeyRound, Mail, IdCard, Phone, Check, LifeBuoy, Smartphone } from 'lucide-react';
import { apiSend, avatarDataUrl, StoredSession } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../school/SchoolContext';
import { enablePush, pushState, isIOSNotInstalled } from '../../lib/push';
import { usePerson } from '../../school/PersonProfile';
import { ReportProblemSheet } from '../../school/ReportProblem';
import { MyPlanCard } from '../../school/MyPlanCard';
import { SessionsCard } from '../../school/SessionsCard';
import { TutorialsCard } from '../../tutorials/TutorialsCard';
import { TakeToPhoneSheet } from '../../school/TakeToPhoneSheet';
import { Avatar, Badge, Card, Field, PageHeader, Sheet, useToast, PasswordInput, newPasswordProblem } from '../../ui';

type UserData = StoredSession['userData'] & { phone?: string | null; biography?: string | null };

const PhotoSheet = ({ open, onClose, hasPhoto }: { open: boolean; onClose: () => void; hasPhoto: boolean }) => {
  const { patchUserData } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const done = (u: UserData, msg: string) => {
    patchUserData({ avatar: u.avatar ?? null });
    qc.invalidateQueries({ queryKey: ['person'] });
    toast(msg);
    setPreview(null);
    onClose();
  };
  const save = useMutation({
    mutationFn: (image: string) => apiSend<UserData>('PUT', '/users/me/avatar', { image }),
    onSuccess: (u) => done(u, 'Foto actualizada'),
    onError: (e: Error) => toast(e.message, true),
  });
  const remove = useMutation({
    mutationFn: () => apiSend<UserData>('DELETE', '/users/me/avatar'),
    onSuccess: (u) => done(u, 'Foto eliminada'),
    onError: (e: Error) => toast(e.message, true),
  });
  const pick = async (f?: File) => {
    if (!f) return;
    try {
      setPreview(await avatarDataUrl(f));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo leer la imagen', true);
    }
  };
  return (
    <Sheet open={open} onClose={() => (setPreview(null), onClose())} title="Foto de perfil">
      <div className="stack" style={{ alignItems: 'center' }}>
        {preview ? (
          <>
            <img src={preview} alt="Vista previa" width={180} height={180} style={{ borderRadius: '50%', objectFit: 'cover', boxShadow: 'var(--shadow)' }} />
            <p className="xs muted">Así se va a ver en mensajes, comunicados y listas.</p>
            <div className="row" style={{ width: '100%' }}>
              <button className="btn btn-ghost grow" onClick={() => input.current?.click()}>Elegir otra</button>
              <button className="btn grow" onClick={() => save.mutate(preview)} disabled={save.isPending}><Check size={16} /> {save.isPending ? 'Guardando…' : 'Usar esta foto'}</button>
            </div>
          </>
        ) : (
          <div className="stack" style={{ width: '100%' }}>
            <button className="btn btn-block" onClick={() => input.current?.click()}><Camera size={18} /> Elegir o sacar una foto</button>
            {hasPhoto && <button className="btn btn-ghost btn-block" onClick={() => remove.mutate()} disabled={remove.isPending}><Trash2 size={16} /> Quitar la foto actual</button>}
            <p className="xs muted" style={{ textAlign: 'center' }}>Se recorta en cuadrado y se achica automáticamente. Usá una foto donde se vea bien tu cara.</p>
          </div>
        )}
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
    </Sheet>
  );
};

const PasswordCard = () => {
  const toast = useToast();
  const { replaceToken } = useAuth();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const change = useMutation({
    mutationFn: () => apiSend<{ token: string }>('PUT', '/users/change-password', { currentPassword: f.current, newPassword: f.next }),
    onSuccess: ({ token }) => {
      replaceToken(token);
      toast('Contraseña actualizada');
      setF({ current: '', next: '', confirm: '' });
    },
    onError: (e: Error) => setError(e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = newPasswordProblem(f.next, f.confirm, f.current);
    if (problem) return setError(problem);
    change.mutate();
  };
  return (
    <form className="card card-pad stack" onSubmit={submit}>
      <h2 className="h3 row"><KeyRound size={18} /> Cambiar contraseña</h2>
      <Field label="Contraseña actual"><PasswordInput value={f.current} onChange={(current) => setF({ ...f, current })} required /></Field>
      <div className="grid grid-2">
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres."><PasswordInput value={f.next} onChange={(next) => setF({ ...f, next })} autoComplete="new-password" required /></Field>
        <Field label="Repetila">
          <PasswordInput value={f.confirm} onChange={(confirm) => setF({ ...f, confirm })} autoComplete="new-password" required invalid={!!f.confirm && f.confirm !== f.next} />
          {!!f.confirm && f.confirm !== f.next && <span className="field-error">No coincide con la nueva contraseña.</span>}
        </Field>
      </div>
      {error && <div className="alert alert-danger small">{error}</div>}
      <button className="btn btn-ghost" disabled={change.isPending || !f.current || !f.next}>{change.isPending ? 'Guardando…' : 'Cambiar contraseña'}</button>
    </form>
  );
};

export default function ProfilePage() {
  const { user, patchUserData, logout } = useAuth();
  const { darkMode, toggleTheme } = useTheme() as { darkMode: boolean; toggleTheme: () => void };
  const { session } = useSchool();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const me = user!.userData as UserData;
  const person = usePerson(session ? me.id : null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [form, setForm] = useState<{ firstName: string; lastName: string; phone: string; biography: string } | null>(null);
  const [push, setPush] = useState(pushState());
  const [reportOpen, setReportOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const data = form ?? { firstName: me.firstName, lastName: me.lastName, phone: me.phone ?? '', biography: me.biography ?? '' };
  const save = useMutation({
    mutationFn: () => apiSend<UserData>('PATCH', '/users/me', { firstName: data.firstName.trim(), lastName: data.lastName.trim(), phone: data.phone.trim() || null, biography: data.biography.trim() || null }),
    onSuccess: (u) => {
      patchUserData({ firstName: u.firstName, lastName: u.lastName, phone: u.phone, biography: u.biography });
      qc.invalidateQueries({ queryKey: ['person', me.id] });
      setForm(null);
      toast('Datos guardados');
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const turnOnPush = async () => {
    try {
      const ok = await enablePush();
      setPush(pushState());
      toast(ok ? 'Notificaciones activadas' : 'No se pudieron activar las notificaciones', !ok);
    } catch {
      toast('No se pudieron activar las notificaciones', true);
    }
  };

  const name = `${me.firstName} ${me.lastName}`;
  const p = person.data;
  const roles = p ? [...p.roles.filter((r) => r.active).map((r) => r.title || `${r.roleLabel}${r.level ? ` · ${r.level}` : ''}`), ...(p.isGuardian ? ['Familia'] : [])] : session?.roleLabels ?? [];
  const email = me.email && !me.email.endsWith('@sin-email.local') ? me.email : null;

  return (
    <div className="stack-lg page-narrow" style={{ margin: '0 auto', width: '100%' }}>
      <PageHeader title="Mi perfil" />

      <div className="profile-hero">
        <div className="profile-cover" />
        <div className="profile-body">
          <div className="profile-photo">
            <Avatar name={name} src={me.avatar} size="xl" />
            <button className="photo-btn" onClick={() => setPhotoOpen(true)} aria-label="Cambiar foto de perfil"><Camera size={16} /></button>
          </div>
          <h2 className="h2">{name}</h2>
          {session && <div className="small muted">{session.school.name}</div>}
          <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}>
            {roles.map((r) => <Badge key={r} tone="info">{r}</Badge>)}
          </div>
          {roles.length > 1 && <div className="xs muted" style={{ textAlign: 'center' }}>Tenés varios roles: ves y podés hacer todo lo que permite cada uno, con el alcance de ambos sumado.</div>}
          {!me.avatar && <button className="btn btn-sm btn-ghost" onClick={() => setPhotoOpen(true)}><Camera size={14} /> Agregar foto</button>}
        </div>
      </div>

      <form className="card card-pad stack" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <h2 className="h3">Mis datos</h2>
        <div className="grid grid-2">
          <Field label="Nombre"><input className="input" required maxLength={80} value={data.firstName} onChange={(e) => setForm({ ...data, firstName: e.target.value })} /></Field>
          <Field label="Apellido"><input className="input" required maxLength={80} value={data.lastName} onChange={(e) => setForm({ ...data, lastName: e.target.value })} /></Field>
        </div>
        <Field label="Teléfono" hint="Lo ve solo el personal de la institución autorizado."><input className="input" inputMode="tel" maxLength={40} value={data.phone} onChange={(e) => setForm({ ...data, phone: e.target.value })} /></Field>
        <Field label="Sobre mí (opcional)" hint={session?.isStaff ? 'Ej: “Docente de Matemática. Consultas por mensaje de lunes a viernes.”' : 'Se muestra en tu perfil a la escuela.'}>
          <textarea className="textarea" rows={3} maxLength={1000} value={data.biography} onChange={(e) => setForm({ ...data, biography: e.target.value })} />
        </Field>
        <dl className="kv">
          {email && (<><dt className="row" style={{ gap: 6 }}><Mail size={14} /> Email</dt><dd>{email}</dd></>)}
          {me.dni && (<><dt className="row" style={{ gap: 6 }}><IdCard size={14} /> DNI</dt><dd>{me.dni}</dd></>)}
          {!email && !me.dni && (<><dt className="row" style={{ gap: 6 }}><Phone size={14} /> Usuario</dt><dd>{me.username}</dd></>)}
        </dl>
        <p className="xs muted">Ingresás con tu {me.dni ? 'DNI' : 'email'}. Para cambiar el email o el DNI, pedíselo a la institución.</p>
        <button className="btn" disabled={!form || save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
      </form>

      {p && p.children.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="h3">Mis hijos</h2>
          <div className="card list" style={{ overflow: 'hidden' }}>
            {p.children.map((c) => (
              <Link key={c.id} to={`/familia/${c.id}`} className="list-item">
                <Avatar name={`${c.firstName} ${c.lastName ?? ''}`} size="sm" />
                <div className="grow">
                  <div className="h3">{c.firstName} {c.lastName}</div>
                  <div className="xs muted">{[c.relationship, c.division && `${c.division.name} · ${c.division.level}`].filter(Boolean).join(' · ')}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {p && p.teaching.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="h3">Mis materias</h2>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {p.teaching.map((t) => <span key={`${t.division.id}-${t.subject.id}`} className="chip">{t.subject.name} · {t.division.name}</span>)}
          </div>
        </section>
      )}

      {session && <MyPlanCard />}

      <PasswordCard />

      <TutorialsCard />
      <SessionsCard />

      <button className="btn btn-block" onClick={() => setPhoneOpen(true)}><Smartphone size={16} /> Llevar Sentryx al celular (QR)</button>
      <TakeToPhoneSheet open={phoneOpen} onClose={() => setPhoneOpen(false)} />

      <Card>
        <div className="stack">
          <h2 className="h3">Preferencias</h2>
          <button className="list-item list-button" style={{ padding: '10px 0' }} onClick={toggleTheme}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            <span className="grow">Modo {darkMode ? 'claro' : 'oscuro'}</span>
            <Badge>{darkMode ? 'Oscuro' : 'Claro'}</Badge>
          </button>
          {session && (
            <div className="list-item" style={{ padding: '10px 0', borderBottom: 0 }}>
              <Bell size={18} />
              <span className="grow">
                Notificaciones en este dispositivo
                {push === 'denied' && <span className="xs muted" style={{ display: 'block' }}>Están bloqueadas: habilitalas desde la configuración del navegador.</span>}
                {push === 'unsupported' && isIOSNotInstalled() && <span className="xs muted" style={{ display: 'block' }}>En iPhone, primero agregá Sentryx a la pantalla de inicio.</span>}
              </span>
              {push === 'granted' ? <Badge tone="ok">Activas</Badge> : push === 'default' ? <button className="btn btn-sm" onClick={turnOnPush}>Activar</button> : <Badge tone="warn">No disponibles</Badge>}
            </div>
          )}
        </div>
      </Card>

      <button className="btn btn-ghost btn-block" onClick={() => setReportOpen(true)}><LifeBuoy size={16} /> Reportar un problema</button>
      <ReportProblemSheet open={reportOpen} onClose={() => setReportOpen(false)} />
      <button className="btn btn-ghost btn-block" onClick={() => (logout(), qc.clear(), navigate('/login', { replace: true }))}><LogOut size={16} /> Cerrar sesión</button>

      <PhotoSheet open={photoOpen} onClose={() => setPhotoOpen(false)} hasPhoto={!!me.avatar} />
    </div>
  );
}
