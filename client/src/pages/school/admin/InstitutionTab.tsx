/** Administración → Institución. */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ImagePlus } from 'lucide-react';
import { apiGet, apiSend, uploadFile } from '../../../lib/api';
import { Card, ErrorBox, Field, Skeleton, useToast, Avatar } from '../../../ui';

interface SchoolSettings { id: number; name: string; slug: string; cue: string | null; address: string | null; phone: string | null; email: string | null; logoUrl: string | null }

export const InstitutionTab = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['school-settings'], queryFn: () => apiGet<SchoolSettings>('/school/settings') });
  const [form, setForm] = useState<Partial<SchoolSettings> | null>(null);
  const [uploading, setUploading] = useState(false);
  const data = form ?? q.data;

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiSend('PATCH', '/school/settings', patch),
    onSuccess: () => {
      toast('Datos del colegio guardados');
      setForm(null);
      qc.invalidateQueries({ queryKey: ['school-settings'] });
      qc.invalidateQueries({ queryKey: ['school-session'] });
      qc.invalidateQueries({ queryKey: ['schools'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('El escudo debe ser una imagen (PNG o JPG).', true);
    setUploading(true);
    try {
      const up = await uploadFile(file, { purpose: 'OTHER' });
      save.mutate({ logoFileId: up.fileId });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al subir', true);
    } finally {
      setUploading(false);
    }
  };

  if (q.error) return <ErrorBox error={q.error} />;
  if (!data) return <Skeleton count={2} h={120} />;
  const link = `${window.location.origin}/c/${q.data?.slug}`;
  const field = (k: keyof SchoolSettings, label: string, type = 'text') => (
    <Field label={label}>
      <input className="input" type={type} value={(data[k] as string) ?? ''} onChange={(e) => setForm({ ...data, [k]: e.target.value })} />
    </Field>
  );

  return (
    <div className="stack-lg">
      <Card>
        <div className="row wrap" style={{ gap: 16 }}>
          {q.data?.logoUrl ? (
            <img src={q.data.logoUrl} alt="Escudo" width={84} height={84} style={{ objectFit: 'contain', borderRadius: 14, background: '#fff', padding: 4, border: '1px solid var(--border)' }} />
          ) : (
            <Avatar name={data.name ?? '?'} size="lg" />
          )}
          <div className="grow stack" style={{ gap: 8 }}>
            <div className="h2">{q.data?.name}</div>
            <p className="xs muted">El escudo y el nombre identifican al colegio dentro de la app. La marca de la plataforma (Sentryx) se mantiene.</p>
            <div className="row wrap">
              <label className="btn btn-sm"><ImagePlus size={16} /> {uploading ? 'Subiendo…' : 'Subir escudo'}<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadLogo(e.target.files?.[0])} /></label>
              {q.data?.logoUrl && <button className="btn btn-sm btn-ghost" onClick={() => save.mutate({ logoFileId: null })}>Quitar</button>}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="stack">
          <h2 className="h3">Link de ingreso para familias y personal</h2>
          <div className="row">
            <input className="input grow" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copiado'))} aria-label="Copiar"><Copy size={16} /></button>
          </div>
          <p className="xs muted">Muestra el escudo y el nombre del colegio en la pantalla de ingreso. Ideal para mandar por WhatsApp o imprimir con un QR.</p>
        </div>
      </Card>

      <form
        className="card card-pad stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (form) save.mutate({ name: form.name, cue: form.cue || null, address: form.address || null, phone: form.phone || null, email: form.email || null });
        }}
      >
        <h2 className="h3">Datos institucionales</h2>
        {field('name', 'Nombre del colegio')}
        <div className="grid grid-2">
          {field('cue', 'CUE')}
          {field('phone', 'Teléfono', 'tel')}
        </div>
        {field('email', 'Email institucional', 'email')}
        {field('address', 'Dirección')}
        <button className="btn btn-block" disabled={!form || save.isPending}>Guardar</button>
      </form>
    </div>
  );
};
