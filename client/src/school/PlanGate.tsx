/**
 * Muestra el contenido si el plan de la persona incluye la función; si no, explica qué incluye el plan
 * necesario y permite pedírselo a la Representante Legal con un toque.
 */
import { ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Sparkles, Check } from 'lucide-react';
import { apiGet, apiSend } from '../lib/api';
import { Badge, Card, Field, Sheet, useToast } from '../ui';
import { useSchool } from './SchoolContext';
import { FEATURE_LABELS, FEATURE_MIN_PLAN, PLAN_NAMES, PlanCode, PlanFeature, PlanInfo, ars, usePlan } from './plans';

interface MyPlan {
  plan: PlanCode;
  catalog: PlanInfo[];
  pendingRequest: { id: number; plan: PlanCode; note: string | null; createdAt: string } | null;
}

export const useMyPlan = () => useQuery({ queryKey: ['my-plan'], queryFn: () => apiGet<MyPlan>('/school/plans/mine'), staleTime: 60_000 });

/** Pedir un plan: le llega a la conducción del nivel (Dirección / Rectoría) o a la Representante Legal. */
export const RequestPlanSheet = ({ open, onClose, plan: initialPlan }: { open: boolean; onClose: () => void; plan: PlanCode }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSchool();
  const mine = useMyPlan();
  const [plan, setPlan] = useState<PlanCode>(initialPlan);
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () => apiSend('POST', '/school/plans/requests', { plan, note: note || null }),
    onSuccess: (r: unknown) => {
      const names = ((r as { approvers?: Array<{ name: string; role: string }> }).approvers ?? []).map((a) => `${a.name} (${a.role})`).join(', ');
      toast(names ? `Listo: se lo enviamos a ${names}. Te llega una notificación cuando lo resuelva.` : 'Listo: te llega una notificación cuando lo resuelvan.');
      qc.invalidateQueries({ queryKey: ['my-plan'] });
      onClose();
    },
    onError: (e: Error) => toast(e.message, true),
  });
  const rank = (code: PlanCode) => (mine.data?.catalog.findIndex((p) => p.code === code) ?? -1);
  const higher = mine.data?.catalog.filter((p) => rank(p.code) > rank(mine.data!.plan)) ?? [];
  const audience = session?.isStaff ? 'forStaff' : 'forFamilies';
  return (
    <Sheet open={open} onClose={onClose} title="Pedir un cambio de plan">
      <div className="stack">
        {mine.data?.pendingRequest && (
          <div className="alert alert-info small">Ya pediste el plan {PLAN_NAMES[mine.data.pendingRequest.plan]}. Si mandás otro pedido, reemplaza al anterior.</div>
        )}
        {higher.map((p) => (
          <button key={p.code} type="button" className="card" style={{ padding: 14, textAlign: 'left', cursor: 'pointer', borderColor: plan === p.code ? 'var(--primary)' : undefined, borderWidth: plan === p.code ? 2 : 1 }} onClick={() => setPlan(p.code)}>
            <div className="row-between">
              <span className="h3">{p.name}</span>
              <span className="h3">{ars(p.price)}<span className="xs muted"> /mes</span></span>
            </div>
            <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {p[audience].map((line) => <li key={line}>{line}</li>)}
            </ul>
          </button>
        ))}
        <Field label="Mensaje (opcional)"><textarea className="textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: lo necesito para usar los juegos en clase" /></Field>
        <button className="btn btn-accent btn-block" disabled={send.isPending || !higher.length} onClick={() => send.mutate()}>{send.isPending ? 'Enviando…' : `Pedir el plan ${PLAN_NAMES[plan]}`}</button>
      </div>
    </Sheet>
  );
};

/** Aviso de función no incluida, con lo que suma el plan necesario. */
export const UpgradeCard = ({ feature, title }: { feature: PlanFeature; title?: string }) => {
  const { plan } = usePlan();
  const mine = useMyPlan();
  const [open, setOpen] = useState(false);
  const needed = FEATURE_MIN_PLAN[feature];
  const info = mine.data?.catalog.find((p) => p.code === needed);
  const pending = mine.data?.pendingRequest;
  return (
    <Card>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '12px 4px' }}>
        <span style={{ width: 52, height: 52, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}><Lock size={24} /></span>
        <h2 className="h2">{title ?? FEATURE_LABELS[feature]}</h2>
        <p className="small muted" style={{ maxWidth: 420 }}>
          Está incluido desde el plan <b>{PLAN_NAMES[needed]}</b>{info ? ` (${ars(info.price)} por mes)` : ''}. Tu plan actual es {plan?.name ?? 'Básico'}.
        </p>
        {info && (
          <div className="stack" style={{ gap: 4, alignItems: 'flex-start' }}>
            {info.features.map((f) => <span key={f.feature} className="row small" style={{ gap: 6 }}><Check size={14} className="accent" /> {f.label}</span>)}
          </div>
        )}
        {pending ? (
          <Badge tone="info">Pediste el plan {PLAN_NAMES[pending.plan]}: está pendiente</Badge>
        ) : (
          <button className="btn btn-accent" onClick={() => setOpen(true)}><Sparkles size={16} /> Pedir el plan {PLAN_NAMES[needed]}</button>
        )}
      </div>
      <RequestPlanSheet open={open} onClose={() => setOpen(false)} plan={needed} />
    </Card>
  );
};

/** Envuelve una pantalla o sección que depende del plan. */
export const PlanGate = ({ feature, title, children }: { feature: PlanFeature; title?: string; children: ReactNode }) => {
  const { hasFeature, plan } = usePlan();
  if (!plan) return null;
  return hasFeature(feature) ? <>{children}</> : <UpgradeCard feature={feature} title={title} />;
};
