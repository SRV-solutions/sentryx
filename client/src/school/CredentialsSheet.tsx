import { Download, Printer, Copy, LogIn } from 'lucide-react';
import { downloadText, csvRow } from '../lib/csv';
import { Sheet, useToast } from '../ui';

export type Credential = { name: string; login: string; tempPassword: string; email: string | null; student?: string };

/**
 * Abre el login en otra pestaña con usuario y contraseña ya cargados (van en el fragmento #…, que nunca
 * viaja al servidor). Sirve para probar el acceso en el momento o para entregar el celular a la persona.
 */
const openLogin = (c: Credential) => {
  const hash = new URLSearchParams({ u: c.login, p: c.tempPassword, n: c.name }).toString();
  window.open(`${window.location.origin}/login#${hash}`, '_blank', 'noopener');
};

/** Muestra UNA vez las contraseñas temporales generadas (altas o blanqueos) para imprimir o dictar. */
export const CredentialsSheet = ({ items, onClose, title = 'Credenciales generadas' }: { items: Credential[]; onClose: () => void; title?: string }) => {
  const toast = useToast();
  const copy = () =>
    navigator.clipboard
      .writeText(items.map((c) => `${c.name}\nUsuario: ${c.login}\nContraseña temporal: ${c.tempPassword}`).join('\n\n'))
      .then(() => toast('Copiado'));
  return (
    <Sheet open={items.length > 0} onClose={onClose} title={title} size="xl">
      <div className="stack">
        <div className="alert alert-warn small">
          <div>
            Se muestran <b>una sola vez</b>. {items.some((i) => i.email) ? 'Quienes tienen email ya las recibieron; al resto' : 'Entregáselas'} en mano o impresas. Al ingresar se les pide elegir una contraseña propia.
            <div style={{ marginTop: 4 }}><b>Probar ingreso</b> abre el login con los datos cargados: ojo, al entrar con esa cuenta se cierra tu sesión en este navegador.</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Nombre</th>{items.some((i) => i.student) && <th>Alumno</th>}<th>Usuario</th><th>Contraseña</th><th>Email</th><th /></tr>
            </thead>
            <tbody>
              {items.map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  {items.some((x) => x.student) && <td>{c.student}</td>}
                  <td>{c.login}</td>
                  <td><code style={{ fontSize: 15, fontWeight: 700 }}>{c.tempPassword}</code></td>
                  <td className="xs muted">{c.email ? 'Enviado ✓' : 'Sin email'}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-ghost" title="Abre el ingreso en otra pestaña con estos datos ya cargados" onClick={() => openLogin(c)}>
                      <LogIn size={14} /> Probar ingreso
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row wrap">
          <button className="btn btn-sm" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
          <button className="btn btn-sm btn-ghost" onClick={copy}><Copy size={16} /> Copiar</button>
          <button className="btn btn-sm btn-ghost" onClick={() => downloadText('credenciales.csv', 'nombre;alumno;usuario;contrasena\n' + items.map((c) => csvRow([c.name, c.student ?? '', c.login, c.tempPassword])).join('\n'))}>
            <Download size={16} /> Descargar
          </button>
        </div>
      </div>
    </Sheet>
  );
};
