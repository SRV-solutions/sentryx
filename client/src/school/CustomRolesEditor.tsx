import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiSend } from '../lib/api';
import { useSchool } from './SchoolContext';
import { Badge, Field, Sheet, useToast } from '../ui';
import type { PermissionKey } from './permissions';

export interface CatalogRole { code: string; name: string; category: 'DIRECTIVO' | 'DOCENTE' | 'FAMILIA' | 'ESTUDIANTE'; rank: number; schoolWide: boolean; leadership?: boolean; description: string; custom?: boolean; permissions: PermissionKey[] }
export interface CatalogPermission { key: PermissionKey; entity: string; action: string; group: string; description: string }

type Draft = { code?: string; name: string; description: string; category: 'DIRECTIVO' | 'DOCENTE'; leadership: boolean; schoolWide: boolean; permissions: PermissionKey[] };

/**
 * Roles personalizados: la conducción arma un rol tildando acciones concretas del catálogo
 * (solo las que ella misma tiene) y después lo asigna desde Personal como cualquier otro rol.
 */
export const CustomRolesEditor = ({ roles, permissions }: { roles: CatalogRole[]; permissions: CatalogPermission[] }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSchool();
  const mine = new Set(session?.permissions ?? []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const custom = roles.filter((r) => r.custom);
  const groups = [...new Set(permissions.map((p) => p.group))];

  const save = useMutation({
    mutationFn: (d: Draft) => (d.code ? apiSend('PUT', `/school/roles/${d.code}`, d) : apiSend('POST', '/school/roles', d)),
    onSuccess: (_r, d) => {
      toast(d.code ? 'Rol actualizado' : 'Rol creado: ya podés asignarlo desde Personal');
      qc.invalidateQueries({ queryKey: ['role-catalog'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      setDraft(null);
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (code: string) => apiSend('DELETE', `/school/roles/${code}`),
    onSuccess: () => (toast('Rol eliminado'), qc.invalidateQueries({ queryKey: ['role-catalog'] })),
    onError: (e: Error) => toast(e.message, true),
  });

  const startFrom = (base?: CatalogRole) =>
    setDraft({ name: '', description: '', category: base?.category === 'DOCENTE' ? 'DOCENTE' : 'DIRECTIVO', leadership: !!base?.leadership, schoolWide: false, permissions: (base?.permissions ?? []).filter((k) => mine.has(k)) });
  const edit = (r: CatalogRole) => setDraft({ code: r.code, name: r.name, description: r.description, category: r.category === 'DOCENTE' ? 'DOCENTE' : 'DIRECTIVO', leadership: !!r.leadership, schoolWide: r.schoolWide, permissions: r.permissions });
  const togglePerm = (k: PermissionKey) => setDraft((d) => d && { ...d, permissions: d.permissions.includes(k) ? d.permissions.filter((x) => x !== k) : [...d.permissions, k] });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError('');
    save.mutate(draft);
  };

  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="row-between wrap">
        <div>
          <h2 className="h3">Roles personalizados del colegio</h2>
          <p className="xs muted">Para cargos que no están en el catálogo (ej: "Coordinador de deportes", "Bibliotecaria"). Solo podés incluir permisos que vos ya tenés.</p>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button className="btn btn-sm" onClick={() => startFrom()}><Plus size={16} /> Nuevo rol</button>
        </div>
      </div>
      {custom.length > 0 && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {custom.map((r) => (
            <div key={r.code} className="list-item wrap">
              <div className="grow" style={{ minWidth: 200 }}>
                <div className="h3">{r.name} <Badge>{r.category === 'DOCENTE' ? 'Docente' : 'Directivo'}</Badge> {r.leadership && <Badge tone="info">Conducción</Badge>}</div>
                <div className="xs muted">{r.description || `${r.permissions.length} permisos`}</div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => edit(r)}><Pencil size={14} /> Editar</button>
                <button className="btn btn-sm btn-ghost" onClick={() => confirm(`¿Eliminar el rol "${r.name}"? Solo se puede si nadie lo tiene asignado.`) && remove.mutate(r.code)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.code ? 'Editar rol' : 'Nuevo rol'}>
        {draft && (
          <form className="stack" onSubmit={submit}>
            <Field label="Nombre del rol"><input className="input" required maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej: Coordinación de deportes" /></Field>
            <Field label="Descripción (opcional)"><input className="input" maxLength={300} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Qué hace esta persona" /></Field>
            <Field label="Tipo" hint="Directivo: ve el alcance de su nivel (o toda la escuela). Docente: solo sus cursos y materias asignados.">
              <div className="chips">
                {(['DIRECTIVO', 'DOCENTE'] as const).map((c) => <button type="button" key={c} className={`chip ${draft.category === c ? 'active' : ''}`} onClick={() => setDraft({ ...draft, category: c })}>{c === 'DIRECTIVO' ? 'Directivo' : 'Docente'}</button>)}
              </div>
            </Field>
            {!draft.code && (
              <Field label="Empezar con los permisos de…">
                <select className="select" onChange={(e) => { const base = roles.find((r) => r.code === e.target.value); if (base) setDraft({ ...draft, permissions: base.permissions.filter((k) => mine.has(k)) }); }} defaultValue="">
                  <option value="">Nada (elegir uno por uno)</option>
                  {roles.filter((r) => !r.custom && r.permissions.length).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
              </Field>
            )}
            {draft.category === 'DIRECTIVO' && (
              <>
                <label className="check"><input type="checkbox" checked={draft.leadership} onChange={(e) => setDraft({ ...draft, leadership: e.target.checked })} /> Es conducción: recibe mensajes de familias y alertas de su nivel</label>
                <label className="check"><input type="checkbox" checked={draft.schoolWide} onChange={(e) => setDraft({ ...draft, schoolWide: e.target.checked })} /> Alcance sobre toda la institución (sin nivel)</label>
              </>
            )}
            <div className="stack" style={{ gap: 6 }}>
              <div className="row-between"><b className="small">Permisos (acciones concretas)</b><span className="xs muted">{draft.permissions.length} elegidos</span></div>
              {groups.map((g) => {
                const items = permissions.filter((p) => p.group === g);
                const available = items.filter((p) => mine.has(p.key));
                if (!available.length) return null;
                return (
                  <div key={g} className="card" style={{ padding: 10 }}>
                    <div className="xs muted" style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>{g}</div>
                    {available.map((p) => (
                      <label key={p.key} className="check" style={{ minHeight: 32, fontSize: 14 }}>
                        <input type="checkbox" checked={draft.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} /> {p.description}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
            {error && <div className="alert alert-danger small">{error}</div>}
            <button className="btn btn-accent btn-block" disabled={save.isPending || !draft.name.trim() || !draft.permissions.length}>{draft.code ? 'Guardar cambios' : 'Crear rol'}</button>
          </form>
        )}
      </Sheet>
    </section>
  );
};
