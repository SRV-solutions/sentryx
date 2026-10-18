/** Administración → Personal: alta masiva desde un CSV (Excel → Guardar como CSV). */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { apiSend } from '../../../lib/api';
import { parseCSV, downloadText } from '../../../lib/csv';
import { Sheet, useToast } from '../../../ui';
import { CredentialsSheet, type Credential } from '../../../school/CredentialsSheet';

const STAFF_CSV_TEMPLATE =
  'nombre;apellido;email;dni;telefono;rol;nivel;cargo\n' +
  'María;González;maria.gonzalez@mail.com;28111222;1155550000;Docente;;\n' +
  'Jorge;Ruiz;;30222333;;Preceptoría;Secundario;Preceptor 2º año\n' +
  'Ana;López;ana.lopez@mail.com;;;Dirección;Primario;Directora de Primaria\n';

interface ImportRow { firstName: string; lastName: string; email: string; dni: string; phone: string; role: string; level: string; title: string }
interface ImportResult { imported: number; errors: Array<{ row: number; message: string }>; credentials: Credential[] }

export const StaffImportButton = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [sendEmails, setSendEmails] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [creds, setCreds] = useState<Credential[]>([]);

  const run = useMutation({
    mutationFn: () => apiSend<ImportResult>('POST', '/school/staff/import', { rows, sendEmails }),
    onSuccess: (r) => {
      setResult(r);
      setRows([]);
      toast(`Se importaron ${r.imported} personas${r.errors.length ? ` · ${r.errors.length} filas con error` : ''}`, r.errors.length > 0 && !r.imported);
      qc.invalidateQueries({ queryKey: ['staff'] });
      if (r.credentials.length) setCreds(r.credentials);
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const onFile = async (file?: File) => {
    if (!file) return;
    setResult(null);
    setRows(
      parseCSV(await file.text()).map((r) => ({
        firstName: r.nombre ?? '',
        lastName: r.apellido ?? '',
        email: r.email ?? '',
        dni: r.dni ?? '',
        phone: r.telefono ?? '',
        role: r.rol ?? '',
        level: r.nivel ?? '',
        title: r.cargo ?? '',
      })),
    );
  };
  const close = () => (setOpen(false), setRows([]), setResult(null));

  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}><Upload size={18} /> Importar CSV</button>
      <Sheet open={open} onClose={close} title="Importar personal">
        <div className="stack">
          <p className="small muted">
            Columnas: nombre, apellido, email, dni, telefono, rol, nivel, cargo. El rol puede ser Docente, Preceptoría, Secretaría, Dirección, Rectoría,
            etc. El nivel vacío significa toda la institución. Cada persona necesita DNI o email para ingresar.
          </p>
          <div className="row wrap">
            <button className="btn btn-sm btn-ghost" onClick={() => downloadText('plantilla-personal.csv', STAFF_CSV_TEMPLATE)}><Download size={16} /> Descargar plantilla</button>
            <label className="btn btn-sm"><Upload size={16} /> Elegir CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} /></label>
          </div>
          {rows.length > 0 && (
            <>
              <div className="card list" style={{ maxHeight: 260, overflow: 'auto' }}>
                {rows.slice(0, 50).map((r, i) => (
                  <div key={i} className="list-item small">
                    <span className="muted" style={{ width: 28 }}>{i + 1}</span>
                    <span className="grow truncate">{r.lastName}, {r.firstName}</span>
                    <span className="xs muted truncate">{r.role}{r.level ? ` · ${r.level}` : ''}</span>
                  </div>
                ))}
                {rows.length > 50 && <div className="list-item xs muted">… y {rows.length - 50} más</div>}
              </div>
              <label className="row small"><input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} /> Enviar el acceso por email a quienes tengan email</label>
              <button className="btn btn-accent btn-block" disabled={run.isPending || rows.length > 500} onClick={() => run.mutate()}>
                {run.isPending ? 'Importando…' : rows.length > 500 ? 'Máximo 500 filas por archivo' : `Importar ${rows.length} personas`}
              </button>
            </>
          )}
          {result && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="alert alert-info small">Importadas: {result.imported}. Las personas que ya tenían cuenta conservan su contraseña.</div>
              {result.errors.map((e) => <div key={e.row} className="alert alert-danger xs">Fila {e.row}: {e.message}</div>)}
            </div>
          )}
        </div>
      </Sheet>
      <CredentialsSheet items={creds} onClose={() => setCreds([])} />
    </>
  );
};
