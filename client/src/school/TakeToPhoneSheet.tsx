import { useEffect, useState } from 'react';
import { Smartphone, RefreshCw } from 'lucide-react';
import { apiSend } from '../lib/api';
import { Sheet, Skeleton } from '../ui';

const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * "Llevar Sentryx al celular": en la computadora muestra un QR con un link de un solo uso que vale
 * 5 minutos. Al escanearlo, el celular entra con tu usuario sin escribir la contraseña (en la app
 * Sentryx si está instalada, o en el navegador, que después ofrece instalarla). Se renueva solo.
 */
export const TakeToPhoneSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const phone = isPhone();

  useEffect(() => {
    if (!open || phone) return;
    let alive = true;
    const make = async () => {
      try {
        const { url } = await apiSend<{ url: string; expiresAt: string }>('POST', '/users/login-link');
        const QRCode = await import('qrcode');
        const img = await QRCode.toDataURL(url, { width: 260, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
        if (alive) (setQr(img), setError(''));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'No se pudo generar el código. Probá de nuevo.');
      }
    };
    make();
    const timer = setInterval(make, 4 * 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open, phone, tick]);

  return (
    <Sheet open={open} onClose={onClose} title="Sentryx en el celular">
      {phone ? (
        <div className="stack">
          <p className="small">Ya estás en el celular. Para tener Sentryx como app:</p>
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
            <li><b>Android (Chrome):</b> menú ⋮ → <i>Instalar app</i> o <i>Agregar a la pantalla de inicio</i>.</li>
            <li><b>iPhone (Safari):</b> botón Compartir → <i>Agregar a inicio</i>.</li>
          </ul>
          <p className="xs muted">Si tenés instalada la app Sentryx, abrila: tu sesión ya queda guardada ahí.</p>
        </div>
      ) : (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <p className="small">Abrí la cámara del celular y apuntá al código: entrás con tu usuario <b>sin escribir la contraseña</b>. Vale 5 minutos y se usa una sola vez.</p>
          {qr ? <img src={qr} alt="QR para entrar desde el celular" width={260} height={260} style={{ borderRadius: 12, border: '1px solid var(--border)' }} /> : error ? <div className="alert alert-danger small">{error}</div> : <Skeleton count={1} h={260} />}
          <button className="btn btn-sm btn-ghost" onClick={() => setTick((t) => t + 1)}><RefreshCw size={14} /> Generar otro código</button>
          <p className="xs muted"><Smartphone size={12} /> Si la app Sentryx está instalada, se abre directo; si no, se abre en el navegador y te ofrece instalarla. No compartas este código: quien lo escanee entra como vos.</p>
        </div>
      )}
    </Sheet>
  );
};
