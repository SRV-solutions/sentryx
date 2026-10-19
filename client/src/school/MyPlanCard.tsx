/** "Mi plan" (Mi perfil): qué incluye, cuánto espacio usé y pedir un plan superior. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gem, Check, Sparkles } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Badge, Card } from '../ui';
import { useSchool } from './SchoolContext';
import { RequestPlanSheet, useMyPlan } from './PlanGate';
import { PLAN_NAMES, PLAN_TONES, PlanCode, formatBytesShort } from './plans';

export const MyPlanCard = () => {
  const { session } = useSchool();
  const mine = useMyPlan();
  const usage = useQuery({ queryKey: ['my-storage'], queryFn: () => apiGet<{ used: number; limit: number }>('/school/files/my-usage'), enabled: !!session?.isStaff });
  const [open, setOpen] = useState(false);
  if (!session?.plan || !mine.data) return null;
  const current = mine.data.catalog.find((p) => p.code === session.plan.code);
  const higher = mine.data.catalog.filter((p) => p.price > (current?.price ?? 0));
  const lines = current ? (session.isStaff ? current.forStaff : current.forFamilies) : [];
  const pct = usage.data ? Math.min(100, Math.round((usage.data.used / usage.data.limit) * 100)) : 0;
  return (
    <Card>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row-between">
          <h2 className="h3 row"><Gem size={18} /> Mi plan</h2>
          <Badge tone={PLAN_TONES[session.plan.code]}>{session.plan.name}</Badge>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          {lines.map((line) => <span key={line} className="row small" style={{ gap: 6 }}><Check size={14} className="accent" /> {line}</span>)}
        </div>
        {usage.data && (
          <div className="stack" style={{ gap: 4 }}>
            <div className="row-between xs muted"><span>Espacio para archivos</span><span>{formatBytesShort(usage.data.used)} de {formatBytesShort(usage.data.limit)}</span></div>
            <div className="progress"><span style={{ width: `${pct}%`, background: pct > 90 ? 'var(--danger)' : undefined }} /></div>
          </div>
        )}
        {mine.data.pendingRequest ? (
          <Badge tone="info">Pediste el plan {PLAN_NAMES[mine.data.pendingRequest.plan as PlanCode]}: está pendiente</Badge>
        ) : (
          higher.length > 0 && <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}><Sparkles size={14} /> Ver planes y pedir un cambio</button>
        )}
      </div>
      {higher.length > 0 && <RequestPlanSheet open={open} onClose={() => setOpen(false)} plan={higher[higher.length - 1].code} />}
    </Card>
  );
};
