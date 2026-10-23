import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search, FileText, Film, Image as ImageIcon, Music, Check, FolderOpen } from 'lucide-react';
import { apiGet, formatBytes, type UploadedFile } from '../lib/api';
import { Sheet, Skeleton, Empty, fmtDate } from '../ui';
import type { Paginated } from './types';

interface FileRow { id: number; name: string; mimeType: string; size: number; purpose: string; createdAt: string; Division: { id: number; name: string } | null }
type Kind = 'all' | 'image' | 'video' | 'doc';

const icon = (mime: string) => (mime.startsWith('video/') ? <Film size={18} /> : mime.startsWith('image/') ? <ImageIcon size={18} /> : mime.startsWith('audio/') ? <Music size={18} /> : <FileText size={18} />);
const kindOf = (mime: string): Kind => (mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'doc');
const PURPOSE: Record<string, string> = { MATERIAL: 'Aula', ANNOUNCEMENT: 'Comunicado', MESSAGE: 'Mensaje', OTHER: 'Mis archivos', EVENT: 'Acto', PROGRAM: 'Programa' };

const useDebounced = (value: string, ms = 300) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

/**
 * "Elegir de mis archivos": lo que ya subiste (desde Archivos, un aula, un comunicado o un mensaje) se comparte
 * en cualquier otro lugar sin volver a subirlo. Devuelve los archivos elegidos con el formato de uploadFile.
 */
export const FilePicker = ({ open, onClose, onPick, max = 10, exclude = [], accept }: { open: boolean; onClose: () => void; onPick: (files: UploadedFile[]) => void; max?: number; exclude?: number[]; accept?: Kind[] }) => {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [kind, setKind] = useState<Kind>('all');
  const [selected, setSelected] = useState<FileRow[]>([]);
  useEffect(() => {
    if (!open) (setSelected([]), setSearch(''), setKind('all'));
  }, [open]);
  const list = useInfiniteQuery({
    queryKey: ['files', 'mine', q, undefined],
    queryFn: ({ pageParam }) => apiGet<Paginated<FileRow>>(`/school/files?scope=mine&page=${pageParam}&limit=30${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ''}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.currentPage < last.pagination.totalPages ? last.pagination.currentPage + 1 : undefined),
    enabled: open,
  });
  const excluded = useMemo(() => new Set(exclude), [exclude]);
  const rows = (list.data?.pages.flatMap((p) => p.data) ?? []).filter((f) => !excluded.has(f.id) && (kind === 'all' || kindOf(f.mimeType) === kind) && (!accept || accept.includes(kindOf(f.mimeType))));
  const toggle = (f: FileRow) =>
    setSelected((prev) => (prev.some((x) => x.id === f.id) ? prev.filter((x) => x.id !== f.id) : prev.length >= max ? prev : [...prev, f]));
  const confirm = () => {
    onPick(selected.map((f) => ({ fileId: f.id, name: f.name, size: f.size, mimeType: f.mimeType })));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Elegir de mis archivos">
      <div className="stack">
        <div style={{ position: 'relative' }}>
          <Search size={16} className="muted" style={{ position: 'absolute', left: 12, top: 13, pointerEvents: 'none' }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Buscar por nombre" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="chips">
          {([['all', 'Todos'], ['image', 'Fotos'], ['video', 'Videos'], ['doc', 'Documentos']] as Array<[Kind, string]>)
            .filter(([k]) => k === 'all' || !accept || accept.includes(k))
            .map(([k, label]) => <button type="button" key={k} className={`chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{label}</button>)}
        </div>
        {list.isLoading && <Skeleton count={4} h={52} />}
        {list.data && !rows.length && <Empty icon={<FolderOpen size={32} strokeWidth={1.5} />} title="No hay archivos" text="Subí archivos desde Archivos, o adjuntá uno nuevo." />}
        {rows.length > 0 && (
          <div className="card list" style={{ overflow: 'hidden', maxHeight: '50vh', overflowY: 'auto' }}>
            {rows.map((f) => {
              const on = selected.some((x) => x.id === f.id);
              return (
                <button type="button" key={f.id} className="list-item list-button" style={{ background: on ? 'var(--info-bg)' : undefined }} onClick={() => toggle(f)}>
                  {icon(f.mimeType)}
                  <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                    <div className="small truncate" style={{ fontWeight: 700 }}>{f.name}</div>
                    <div className="xs muted">{formatBytes(f.size)} · {fmtDate(f.createdAt, { day: 'numeric', month: 'short' })} · {PURPOSE[f.purpose] ?? f.purpose}{f.Division ? ` · ${f.Division.name}` : ''}</div>
                  </div>
                  {on && <Check size={18} color="var(--primary)" />}
                </button>
              );
            })}
            {list.hasNextPage && <button type="button" className="btn btn-ghost btn-sm" style={{ margin: 8 }} onClick={() => list.fetchNextPage()}>Ver más</button>}
          </div>
        )}
        <div className="row-between">
          <span className="xs muted">{selected.length ? `${selected.length} elegido${selected.length > 1 ? 's' : ''}${max > 1 ? ` (máx. ${max})` : ''}` : max > 1 ? `Podés elegir hasta ${max}.` : 'Elegí un archivo.'}</span>
          <button type="button" className="btn" disabled={!selected.length} onClick={confirm}>Compartir {selected.length > 1 ? `${selected.length} archivos` : 'archivo'}</button>
        </div>
      </div>
    </Sheet>
  );
};
