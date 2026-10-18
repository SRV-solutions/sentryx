import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { apiSend } from '../../lib/api';

/** Pedido de recupero: llega un link por email. Quien no tiene email lo pide en la secretaría del colegio. */
export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiSend('POST', '/users/request-password-reset', { email: identifier.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el pedido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card card-pad stack" style={{ width: '100%', maxWidth: 420 }}>
        <Link to="/login" className="row small muted"><ArrowLeft size={16} /> Volver al ingreso</Link>
        <h1 className="h2">Recuperar contraseña</h1>
        {sent ? (
          <div className="alert alert-ok">
            <MailCheck size={20} />
            <div className="small">
              Si los datos coinciden con una cuenta con email, te enviamos un link para elegir una nueva contraseña (vence en 1 hora). Revisá también el correo no deseado.
            </div>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <p className="small muted">Ingresá tu email o DNI. Si tu cuenta no tiene email, pedí el blanqueo en la secretaría de tu colegio.</p>
            <div className="field">
              <label htmlFor="id">Email o DNI</label>
              <input id="id" className="input" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </div>
            {error && <div className="alert alert-danger small">{error}</div>}
            <button className="btn btn-accent btn-block" disabled={loading || identifier.trim().length < 3}>{loading ? 'Enviando…' : 'Enviar link'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
