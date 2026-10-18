import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Badge, Card, ErrorBox, Skeleton } from '../ui';
import { CATEGORY_LABELS, type Category, type SchoolRole } from './types';
import type { PermissionKey } from './permissions';

interface RoleCatalog {
  permissions: Array<{ key: PermissionKey; entity: string; action: string; group: string; description: string }>;
  roles: Array<{ code: SchoolRole; name: string; category: Category; rank: number; schoolWide: boolean; description: string; permissions: PermissionKey[] }>;
}

const SHORT_NAMES: Partial<Record<SchoolRole, string>> = { REPRESENTANTE_LEGAL: 'Rep. Legal', VICEDIRECTOR: 'Vicedir.', ADMINISTRACION: 'Admin.', PRECEPTOR: 'Precep.', SECRETARIO: 'Secret.' };
const CATEGORY_ORDER: Category[] = ['DIRECTIVO', 'DOCENTE', 'FAMILIA', 'ESTUDIANTE'];

/**
 * Matriz de roles y permisos (solo lectura). Sale de las tablas Role / Permission / RolePermission:
 * lo que se ve acá es exactamente lo que la API aplica.
 */
export const RolesMatrix = () => {
  const catalog = useQuery({ queryKey: ['role-catalog'], queryFn: () => apiGet<RoleCatalog>('/school/roles'), staleTime: 5 * 60_000 });
  if (catalog.error) return <ErrorBox error={catalog.error} />;
  if (!catalog.data) return <Skeleton count={3} h={120} />;
  const { roles, permissions } = catalog.data;
  const groups = [...new Set(permissions.map((p) => p.group))];
  const rolesWithPermissions = roles.filter((r) => r.permissions.length);

  return (
    <div className="stack-lg">
      <p className="small muted">
        Una persona tiene uno o más roles <b>en este colegio</b>, y cada rol tiene permisos: una <b>acción</b> sobre algo (ver, crear, editar, publicar…).
        El alcance (qué nivel o divisiones) se elige al dar de alta a cada persona. Solo se otorgan roles de menor jerarquía que el propio.
      </p>

      {CATEGORY_ORDER.map((category) => {
        const inCategory = roles.filter((r) => r.category === category);
        if (!inCategory.length) return null;
        return (
          <section key={category} className="stack" style={{ gap: 8 }}>
            <h2 className="h3">{CATEGORY_LABELS[category]}</h2>
            <div className="grid grid-auto">
              {inCategory.map((role) => (
                <Card key={role.code}>
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row-between">
                      <b>{role.name}</b>
                      {role.schoolWide && <Badge tone="info">Toda la institución</Badge>}
                    </div>
                    <span className="xs muted">{role.description}</span>
                    <span className="xs">{role.permissions.length ? `${role.permissions.length} permisos` : 'Sin permisos administrativos'}</span>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="h3">Matriz de permisos</h2>
        <div className="table-wrap card">
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Permiso</th>
                {rolesWithPermissions.map((role) => (
                  <th key={role.code} style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title={role.name}>{SHORT_NAMES[role.code] ?? role.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group}>
                  <tr><td colSpan={rolesWithPermissions.length + 1} style={{ fontWeight: 800, background: 'var(--surface-2)' }}>{group}</td></tr>
                  {permissions.filter((p) => p.group === group).map((permission) => (
                    <tr key={permission.key}>
                      <td>{permission.description}</td>
                      {rolesWithPermissions.map((role) => (
                        <td key={role.code} style={{ textAlign: 'center' }}>
                          {role.permissions.includes(permission.key) ? <Check size={16} color="var(--ok, #16a34a)" aria-label="Sí" /> : <span className="muted">·</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xs muted">Familias y Estudiantes no tienen permisos administrativos: solo ven lo propio (sus hijos o su curso) y escriben mensajes.</p>
      </section>
    </div>
  );
};
