import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorSmartphone, LogOut, X } from 'lucide-react';
import { apiGet, apiSend } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Badge, Card, Skeleton, useToast, timeAgo } from '../ui';

interface SessionRow { id: string; device: string; ip: string | null; createdAt: string; lastUsedAt: string; current: boolean }

/**
 * Dónde está abierta la sesión (cada login es un dispositivo) y cierre remoto: "Cerrar sesión en los
 * otros dispositivos" sirve si prestaste el celular, cambiaste de teléfono o entraste en una PC ajena.
 */
export const SessionsCard = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const { replaceToken } = useAuth();
  const q = useQuery({ queryKey: ['my-sessions'], queryFn: () => apiGet<{ sessions: SessionRow[]; idleDays: number }>('/users/sessions') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['my-sessions'] });
  const closeOthers = useMutation({
    mutationFn: () => apiSend<{ closed: number; token?: string }>('POST', '/users/sessions/logout-others'),
    // Este dispositivo sigue con un token nuevo; todos los anteriores dejan de servir.
    onSuccess: (r) => (r.token && replaceToken(r.token), refresh(), toast(r.closed ? `Se cerró la sesión en ${r.closed} ${r.closed === 1 ? 'dispositivo' : 'dispositivos'}` : 'No había otras sesiones abiertas')),
    onError: (e: Error) => toast(e.message, true),
  });
  const closeOne = useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/users/sessions/${id}`),
    onSuccess: () => (refresh(), toast('Sesión cerrada')),
    onError: (e: Error) => toast(e.message, true),
  });
  const others = (q.data?.sessions ?? []).filter((s) => !s.current);

  return (
    <Card>
      <div className="stack">
        <h2 className="h3 row"><MonitorSmartphone size={18} /> Sesiones y dispositivos</h2>
        <p className="xs muted">Tu sesión dura {q.data?.idleDays ?? 30} días desde la última vez que usaste Sentryx en cada dispositivo. Si prestaste el celular o entraste en una computadora ajena, cerrala desde acá.</p>
        {q.isLoading && <Skeleton count={2} h={48} />}
        {q.data && (
          <div className="card list" style={{ overflow: 'hidden' }}>
            {q.data.sessions.map((s) => (
              <div key={s.id} className="list-item" style={{ padding: '10px 12px' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small truncate" style={{ fontWeight: 700 }}>{s.device} {s.current && <Badge tone="ok">Este dispositivo</Badge>}</div>
                  <div className="xs muted">Último uso {timeAgo(s.lastUsedAt)}{s.ip ? ` · IP ${s.ip}` : ''} · desde {timeAgo(s.createdAt)}</div>
                </div>
                {!s.current && <button className="icon-btn" title="Cerrar esta sesión" aria-label="Cerrar esta sesión" onClick={() => closeOne.mutate(s.id)} disabled={closeOne.isPending}><X size={16} /></button>}
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-ghost" disabled={!others.length || closeOthers.isPending} onClick={() => closeOthers.mutate()}>
          <LogOut size={16} /> Cerrar sesión en los otros dispositivos{others.length ? ` (${others.length})` : ''}
        </button>
      </div>
    </Card>
  );
};
