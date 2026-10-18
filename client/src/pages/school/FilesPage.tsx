import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Film, Image as ImageIcon, Music, Trash2, Search, Download, HardDrive } from 'lucide-react';
import { apiGet, apiSend, formatBytes } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Badge, Card, Empty, ErrorBox, PageHeader, Skeleton, Tabs, fmtDate, useToast } from '../../ui';
import type { Paginated } from '../../school/types';
import { Entity, Action } from '../../school/permissions';

interface FileRow {
  id: number;
  name: string;
  mimeType: string;
  size: number;
  purpose: string;
  createdAt: string;
  Uploader: { id: number; firstName: string; lastName: string };
  Division: { id: number; name: string } | null;
  Subject: { id: number; name: string } | null;
}

interface Usage {
  quota: number;
  used: number;
  byUser: Array<{ uploaderId: number; firstName: string; lastName: string; files: number; bytes: string }>;
  byType: Array<{ kind: string; files: number; bytes: string }>;
}

const icon = (mime: string) => (mime.startsWith('video/') ? <Film size={18} /> : mime.startsWith('image/') ? <ImageIcon size={18} /> : mime.startsWith('audio/') ? <Music size={18} /> : <FileText size={18} />);
const PURPOSE: Record<string, string> = { MATERIAL: 'Material de aula', ANNOUNCEMENT: 'Adjunto de comunicado', MESSAGE: 'Adjunto de mensaje', OTHER: 'Otro' };

const FileList = ({ scope, uploaderId }: { scope: 'mine' | 'school'; uploaderId?: number }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['files', scope, q, uploaderId],
    queryFn: ({ pageParam }) => apiGet<Paginated<FileRow>>(`/school/files?scope=${scope}&page=${pageParam}&limit=30${q.length >= 2 ? `&q=${encodeURIComponent(q)}` : ''}${uploaderId ? `&uploaderId=${uploaderId}` : ''}`),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.pagination.currentPage < l.pagination.totalPages ? l.pagination.currentPage + 1 : undefined),
  });
  const del = useMutation({
    mutationFn: (id: number) => apiSend('DELETE', `/school/files/${id}`),
    onSuccess: () => {
      toast('Archivo eliminado');
      qc.invalidateQueries({ queryKey: ['files'] });
      qc.invalidateQueries({ queryKey: ['files-usage'] });
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const open = async (id: number) => {
    try {
      const f = await apiGet<{ url: string }>(`/school/files/${id}`);
      window.open(f.url, '_blank', 'noopener');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo abrir', true);
    }
  };
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="stack">
      <div style={{ position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: 14, top: 14 }} className="muted" />
        <input className="input" style={{ paddingLeft: 42 }} placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.error && <ErrorBox error={list.error} />}
      {list.isLoading && <Skeleton count={5} h={56} />}
      {!list.isLoading && !rows.length && <Empty title="No hay archivos" text="Los archivos que subas a tus aulas, comunicados y mensajes aparecen acá." />}
      {rows.length > 0 && (
        <div className="card list" style={{ overflow: 'hidden' }}>
          {rows.map((f) => (
            <div key={f.id} className="list-item">
              <span className="muted">{icon(f.mimeType)}</span>
              <div className="grow">
                <div className="h3 truncate">{f.name}</div>
                <div className="xs muted truncate">
                  {formatBytes(f.size)} · {fmtDate(f.createdAt, { day: 'numeric', month: 'short' })} · {PURPOSE[f.purpose]}
                  {f.Division && <> · <Link to={`/aulas/${f.Division.id}`}>{f.Division.name}</Link></>}
                  {f.Subject && ` · ${f.Subject.name}`}
                  {scope === 'school' && ` · ${f.Uploader.firstName} ${f.Uploader.lastName}`}
                </div>
              </div>
              <button className="icon-btn" onClick={() => open(f.id)} aria-label="Abrir"><Download size={16} /></button>
              <button className="icon-btn" onClick={() => confirm(`¿Eliminar "${f.name}"? Se borra definitivamente y deja de verse en las publicaciones.`) && del.mutate(f.id)} aria-label="Eliminar"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {list.hasNextPage && <button className="btn btn-ghost" onClick={() => list.fetchNextPage()}>Ver más</button>}
    </div>
  );
};

const UsagePanel = ({ onPickUser }: { onPickUser: (id: number) => void }) => {
  const q = useQuery({ queryKey: ['files-usage'], queryFn: () => apiGet<Usage>('/school/files/usage') });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Skeleton count={2} h={90} />;
  const pct = Math.min(100, Math.round((q.data.used / q.data.quota) * 100));
  return (
    <div className="stack">
      <Card>
        <div className="stack">
          <div className="row-between">
            <span className="row h3"><HardDrive size={18} /> Almacenamiento</span>
            <span className="small"><b>{formatBytes(q.data.used)}</b> de {formatBytes(q.data.quota)}</span>
          </div>
          <div className="progress" style={{ height: 10 }}><span style={{ width: `${pct}%`, background: pct > 85 ? 'var(--danger)' : pct > 65 ? 'var(--brand-orange)' : undefined }} /></div>
          <div className="row wrap" style={{ gap: 6 }}>
            {q.data.byType.map((t) => <Badge key={t.kind}>{t.kind}: {formatBytes(Number(t.bytes))}</Badge>)}
          </div>
        </div>
      </Card>
      <h2 className="h2">Por docente</h2>
      <div className="card list" style={{ overflow: 'hidden' }}>
        {q.data.byUser.map((u) => (
          <button key={u.uploaderId} className="list-item" style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--border)', width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => onPickUser(u.uploaderId)}>
            <span className="grow h3">{u.lastName}, {u.firstName}</span>
            <span className="xs muted">{u.files} archivos</span>
            <Badge>{formatBytes(Number(u.bytes))}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
};

/** Gestión de archivos: cada docente administra lo suyo; administración ve el uso total y puede liberar espacio. */
export default function FilesPage() {
  const { can } = useSchool();
  const admin = can(Entity.USERS, Action.UPDATE);
  const [tab, setTab] = useState<'mine' | 'usage' | 'school'>('mine');
  const [uploaderId, setUploaderId] = useState<number | undefined>();
  return (
    <div className="stack">
      <PageHeader title="Archivos" subtitle="Materiales y adjuntos subidos a la plataforma." />
      {admin && (
        <Tabs value={tab} onChange={(v) => (setTab(v), setUploaderId(undefined))} items={[{ value: 'mine', label: 'Mis archivos' }, { value: 'usage', label: 'Uso' }, { value: 'school', label: 'Todos' }]} />
      )}
      {tab === 'mine' && <FileList scope="mine" />}
      {tab === 'usage' && <UsagePanel onPickUser={(id) => (setUploaderId(id), setTab('school'))} />}
      {tab === 'school' && <FileList scope="school" uploaderId={uploaderId} />}
    </div>
  );
}
