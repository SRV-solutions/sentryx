import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Send } from 'lucide-react';
import { apiGet, apiSend, formatBytes, STORAGE_FULL_EVENT, type StorageFullDetail } from '../lib/api';
import { Field, Sheet, useToast } from '../ui';
import { useMyPlan } from './PlanGate';
import { PLAN_NAMES, ars, type PlanCode } from './plans';

interface Approvers { approvers: Array<{ userId: number; name: string; role: string }>; used: number; limit: number; plan: PlanCode }
const GB = 1024 ** 3;

/**
 * Se abre sola cuando una subida no entra en el espacio de la persona (en cualquier pantalla):
 * explica cuánto falta y permite pedir un plan con más espacio, con el motivo, a la conducción de su nivel.
 */
export const StorageFullSheet = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [detail, setDetail] = useState<StorageFullDetail | null>(null);
  const [plan, setPlan] = useState<PlanCode | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    const onFull = (e: Event) => setDetail((e as CustomEvent<StorageFullDetail>).detail);
    window.addEventListener(STORAGE_FULL_EVENT, onFull);
    return () => window.removeEventListener(STORAGE_FULL_EVENT, onFull);
  }, []);
  const open = !!detail;
  const mine = useMyPlan();
  const who = useQuery({ queryKey: ['plan-approvers'], queryFn: () => apiGet<Approvers>('/school/plans/approvers'), enabled: open, staleTime: 60_000 });
  const needed = detail ? detail.used + detail.needed : 0;
  // Planes superiores al actual; el sugerido es el más chico donde entra el archivo.
  const options = useMemo(() => {
    const catalog = mine.data?.catalog ?? [];
    const current = catalog.findIndex((p) => p.code === mine.data?.plan);
    return catalog.filter((_p, i) => i > current).map((p) => ({ ...p, fits: p.storageGb * GB >= needed }));
  }, [mine.data, needed]);
  const suggested = options.find((p) => p.fits)?.code ?? null;
  useEffect(() => {
    if (open) (setPlan(suggested), setNote(''));
  }, [open, suggested]);

  const send = useMutation({
    mutationFn: () => apiSend<{ approvers: Approvers['approvers'] }>('POST', '/school/plans/requests', { plan, note: note.trim() || null, context: { kind: 'storage', fileName: detail?.fileName, fileSize: detail?.needed } }),
    onSuccess: (r) => {
      const names = r.approvers.map((a) => `${a.name} (${a.role})`).join(', ');
      toast(names ? `Pedido enviado a ${names}. Te avisamos cuando lo resuelva.` : 'Pedido enviado. Te avisamos cuando lo resuelvan.');
      qc.invalidateQueries({ queryKey: ['my-plan'] });
      setDetail(null);
    },
    onError: (e: Error) => toast(e.message, true),
  });

  if (!detail) return null;
  const pending = mine.data?.pendingRequest;
  return (
    <Sheet open={open} onClose={() => setDetail(null)} title="No te alcanza el espacio">
      <div className="stack">
        <div className="alert alert-warn small">
          <div>
            <b>{detail.fileName ?? 'El archivo'}</b> pesa <b>{formatBytes(detail.needed)}</b> y te quedan <b>{formatBytes(detail.available)}</b> libres de tus {Math.round(detail.limit / GB)} GB
            {mine.data ? ` (plan ${PLAN_NAMES[mine.data.plan]})` : ''}.
          </div>
        </div>
        <div className="progress" aria-label="Espacio usado"><span style={{ width: `${Math.min(100, (detail.used / detail.limit) * 100)}%`, background: 'var(--danger)' }} /></div>
        <p className="small">Podés <Link to="/archivos" onClick={() => setDetail(null)}>liberar espacio en Archivos</Link> o pedir un plan con más espacio.</p>

        {suggested ? (
          <>
            <Field label="Plan que pedís">
              <div className="stack" style={{ gap: 6 }}>
                {options.map((p) => (
                  <button key={p.code} type="button" disabled={!p.fits} className="card row-between" style={{ padding: 12, textAlign: 'left', cursor: p.fits ? 'pointer' : 'not-allowed', opacity: p.fits ? 1 : 0.5, borderColor: plan === p.code ? 'var(--primary)' : undefined, borderWidth: plan === p.code ? 2 : 1 }} onClick={() => p.fits && setPlan(p.code)}>
                    <span><b>{p.name}</b> · {p.storageGb} GB{p.code === suggested && <span className="xs muted"> · recomendado</span>}{!p.fits && <span className="xs muted"> · no alcanza</span>}</span>
                    <span className="small">{ars(p.price)}/mes</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Motivo" hint="Lo lee quien aprueba el pedido.">
              <textarea className="textarea" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: quiero pasarle una película a 5º A para trabajar en Lengua." />
            </Field>
            {who.data && (
              <p className="xs muted">
                Le llega a: <b>{who.data.approvers.map((a) => `${a.name} (${a.role})`).join(', ') || 'la conducción del colegio'}</b>. Puede aprobarlo o no; te llega una notificación con la respuesta.
              </p>
            )}
            {pending && <p className="xs muted">Ya tenés un pedido pendiente (plan {PLAN_NAMES[pending.plan]}): este lo reemplaza.</p>}
            <button className="btn btn-accent btn-block" disabled={!plan || send.isPending} onClick={() => send.mutate()}>
              <Send size={16} /> {send.isPending ? 'Enviando…' : `Pedir el plan ${plan ? PLAN_NAMES[plan] : ''}`}
            </button>
          </>
        ) : (
          <div className="alert alert-info small"><HardDrive size={16} /> Ningún plan alcanza para este archivo: liberá espacio en Archivos o, si es un video largo, subilo a YouTube como "no listado" y pegá el link.</div>
        )}
      </div>
    </Sheet>
  );
};
