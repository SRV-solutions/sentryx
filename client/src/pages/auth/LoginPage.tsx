import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { API_URL, setSchoolId, LOGOUT_REASON_KEY } from '../../lib/api';
import { Moon, Sun } from 'lucide-react';
import { PasswordInput } from '../../ui';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export default function LoginPage() {
  const { login, loginWithLink } = useAuth();
  const [params, setParams] = useSearchParams();
  const qrLink = params.get('link');
  const { darkMode, toggleTheme } = useTheme() as { darkMode: boolean; toggleTheme: () => void };
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // Por qué se cerró la sesión (desde otro dispositivo, contraseña cambiada, vencida): se muestra una vez.
  const [ended] = useState<string | null>(() => {
    try {
      const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
      sessionStorage.removeItem(LOGOUT_REASON_KEY);
      return reason;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  // Llegó escaneando el QR "Llevar Sentryx al celular": entra con el link de un solo uso, sin contraseña.
  useEffect(() => {
    if (!qrLink) return;
    setLoading(true);
    loginWithLink(qrLink)
      .then((data) => navigate(data.userData.mustChangePassword ? '/cambiar-clave' : '/', { replace: true }))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No se pudo entrar con el código.');
        setParams({}, { replace: true });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrLink]);

  // Datos precargados desde "Probar ingreso" (hoja de credenciales): vienen en el #fragmento y se borran al leerlos.
  const [prefilled, setPrefilled] = useState<{ name: string; fromMail: boolean } | null>(null);
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const h = new URLSearchParams(hash);
    if (!h.get('u')) return;
    setIdentifier(h.get('u') ?? '');
    setPassword(h.get('p') ?? '');
    setPrefilled({ name: h.get('n') || h.get('u') || '', fromMail: h.get('m') === 'mail' });
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  // Login con la identidad del colegio: /c/:slug (link que cada colegio comparte con sus familias).
  const { slug } = useParams();
  const [school, setSchool] = useState<{ id: number; name: string; logoUrl: string | null } | null>(null);
  useEffect(() => {
    if (!slug) return;
    fetch(`${API_URL}/public/schools/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setSchool)
      .catch(() => setSchool(null));
  }, [slug]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(identifier.trim(), password);
      if (school) setSchoolId(school.id);
      navigate(data.userData.mustChangePassword ? '/cambiar-clave' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: 16 }}>
      <div className="row-between">
        <span />
        <button className="icon-btn" onClick={toggleTheme} aria-label="Cambiar tema">
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 400 }} className="stack-lg">
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            {school ? (
              <>
                {school.logoUrl ? (
                  <img src={school.logoUrl} alt={school.name} width={88} height={88} style={{ objectFit: 'contain', borderRadius: 16, background: '#fff', padding: 6 }} />
                ) : (
                  <img src="https://wearesrv.com/srv-logo-256.webp" alt="SRV" width={72} height={72} />
                )}
                <h1 className="h1">{school.name}</h1>
                <p className="muted">Ingresá a la plataforma de tu colegio en <span className="brand-text" style={{ fontWeight: 800 }}>Sentryx</span><span className="accent">.</span></p>
              </>
            ) : (
              <>
                <img src="https://wearesrv.com/srv-logo-256.webp" alt="SRV" width={72} height={72} />
                <h1 className="h1">
                  Bienvenido a <span className="brand-text">Sentryx</span>
                  <span className="accent">.</span>
                </h1>
                <p className="muted">Comunicados, mensajes, notas y asistencia de tu escuela, en un solo lugar.</p>
              </>
            )}
          </div>

          <form className="card card-pad stack" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="id">Email o DNI</label>
              <input
                id="id"
                className="input"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="tu@email.com o 30123456"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="pw">Contraseña</label>
              <PasswordInput id="pw" value={password} onChange={setPassword} required />
            </div>
            {prefilled && (prefilled.fromMail ? (
              <div className="alert alert-info small">¡Hola <b>{prefilled.name}</b>! Ya cargamos tu usuario y tu contraseña temporal: tocá <b>Ingresar</b>. Después te vamos a pedir que elijas una contraseña propia.</div>
            ) : (
              <div className="alert alert-info small">Datos cargados para probar el ingreso de <b>{prefilled.name}</b>. Al entrar, en este navegador queda abierta esa sesión (se cierra la tuya).</div>
            ))}
            {qrLink && loading && <div className="alert alert-info small">Entrando…</div>}
            {ended && !error && <div className="alert alert-warn small">{ended}</div>}
            {error && <div className="alert alert-danger">{error}</div>}
            <button className="btn btn-accent btn-block" disabled={loading || !identifier || !password}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
            <Link to="/forgot-password" className="small" style={{ textAlign: 'center' }}>
              ¿Olvidaste tu contraseña?
            </Link>
          </form>

          <p className="xs muted" style={{ textAlign: 'center' }}>
            ¿No tenés usuario? Pedíselo a la secretaría de tu colegio.
            <br />
            Sentryx · por{' '}
            <a href="https://wearesrv.com" target="_blank" rel="noreferrer">
              SRV
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
