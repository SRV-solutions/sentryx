import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiSend } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { PasswordInput, newPasswordProblem } from '../../ui';

/** Primer ingreso con contraseña temporal: obliga a elegir una propia. */
export default function ForcePasswordChange() {
  const { patchUserData, replaceToken, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = newPasswordProblem(next, confirm, current);
    if (problem) return setError(problem);
    setLoading(true);
    try {
      const { token } = await apiSend<{ token: string }>('PUT', '/users/change-password', { currentPassword: current, newPassword: next });
      replaceToken(token);
      patchUserData({ mustChangePassword: false });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form className="card card-pad stack" style={{ width: '100%', maxWidth: 420 }} onSubmit={submit}>
        <h1 className="h2">Elegí tu contraseña</h1>
        <p className="muted small">Ingresaste con una contraseña temporal. Por seguridad, creá una propia (mínimo 8 caracteres).</p>
        <div className="field">
          <label htmlFor="cur">Contraseña temporal</label>
          <PasswordInput id="cur" value={current} onChange={setCurrent} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="new">Nueva contraseña</label>
          <PasswordInput id="new" value={next} onChange={setNext} autoComplete="new-password" required />
          <span className="xs muted">Mínimo 8 caracteres. Tiene que ser distinta de la temporal.</span>
        </div>
        <div className="field">
          <label htmlFor="conf">Repetí la nueva contraseña</label>
          <PasswordInput id="conf" value={confirm} onChange={setConfirm} autoComplete="new-password" required invalid={!!confirm && confirm !== next} />
          {!!confirm && confirm !== next && <span className="field-error">Las contraseñas no coinciden.</span>}
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <button className="btn btn-accent btn-block" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar y continuar'}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => (logout(), navigate('/login'))}>
          Salir
        </button>
      </form>
    </div>
  );
}
