import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export default function LoginPage() {
  const { login } = useAuth();
  const { darkMode, toggleTheme } = useTheme() as { darkMode: boolean; toggleTheme: () => void };
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(identifier.trim(), password);
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
            <img src="https://wearesrv.com/srv-logo-256.webp" alt="SRV" width={72} height={72} />
            <h1 className="h1">
              Bienvenido a <span className="brand-text">Sentryx</span>
              <span className="accent">.</span>
            </h1>
            <p className="muted">Comunicados, mensajes, notas y asistencia de tu escuela, en un solo lugar.</p>
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
              <div style={{ position: 'relative' }}>
                <input
                  id="pw"
                  className="input"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 48 }}
                />
                <button type="button" className="icon-btn" style={{ position: 'absolute', right: 3, top: 3 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <button className="btn btn-accent btn-block" disabled={loading || !identifier || !password}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
            <Link to="/forgot-password" className="small" style={{ textAlign: 'center' }}>
              ¿Olvidaste tu contraseña?
            </Link>
          </form>

          <p className="xs muted" style={{ textAlign: 'center' }}>
            ¿Querés aprender a programar? <Link to="/register">Creá tu cuenta de cursos SRV</Link>
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
