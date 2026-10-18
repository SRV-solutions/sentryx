import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { apiSend } from '../../lib/api';
import { PasswordInput, newPasswordProblem } from '../../ui';

/** Nueva contraseña desde el link del email (/reset-password?token=…). */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = newPasswordProblem(password, confirm);
    if (problem) return setError(problem);
    setLoading(true);
    try {
      await apiSend('POST', '/users/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card card-pad stack" style={{ width: '100%', maxWidth: 420 }}>
        <h1 className="h2">Elegí una nueva contraseña</h1>
        {!token && <div className="alert alert-danger small">El link está incompleto. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".</div>}
        {done ? (
          <div className="alert alert-ok"><CheckCircle2 size={20} /> <div className="small">¡Listo! Ya podés ingresar con tu nueva contraseña.</div></div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="p1">Nueva contraseña</label>
              <PasswordInput id="p1" value={password} onChange={setPassword} autoComplete="new-password" required autoFocus />
              <span className="xs muted">Mínimo 8 caracteres.</span>
            </div>
            <div className="field">
              <label htmlFor="p2">Repetila</label>
              <PasswordInput id="p2" value={confirm} onChange={setConfirm} autoComplete="new-password" required invalid={!!confirm && confirm !== password} />
              {!!confirm && confirm !== password && <span className="field-error">Las contraseñas no coinciden.</span>}
            </div>
            {error && <div className="alert alert-danger small">{error}</div>}
            <button className="btn btn-accent btn-block" disabled={loading || !token}>{loading ? 'Guardando…' : 'Guardar contraseña'}</button>
          </form>
        )}
        <Link to="/login" className="small" style={{ textAlign: 'center' }}>Volver al ingreso</Link>
      </div>
    </div>
  );
}
