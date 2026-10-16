import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiSend } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

/** Primer ingreso con contraseña temporal: obliga a elegir una propia. */
export default function ForcePasswordChange() {
  const { patchUserData, logout } = useAuth() as { patchUserData: (p: object) => void; logout: () => void };
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (next !== confirm) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    try {
      await apiSend('PUT', '/users/change-password', { currentPassword: current, newPassword: next });
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
          <input id="cur" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="new">Nueva contraseña</label>
          <input id="new" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="conf">Repetí la nueva contraseña</label>
          <input id="conf" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
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
