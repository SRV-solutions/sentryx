/** Administración → Auditoría: actividad (con IP) y cambios/ingresos del colegio. */
import { useState } from 'react';
import { Tabs } from '../../../ui';
import { ActivityLogView, ChangeLogView } from '../../../school/AuditViews';

export const AuditTab = () => {
  const [view, setView] = useState<'changes' | 'activity'>('changes');
  return (
    <div className="stack">
      <Tabs value={view} onChange={setView} items={[{ value: 'changes', label: 'Cambios e ingresos' }, { value: 'activity', label: 'Actividad' }]} />
      <p className="xs muted">
        {view === 'changes'
          ? 'Altas, bajas, cambios de notas y permisos (con el antes y el después) e ingresos a la cuenta de la gente del colegio.'
          : 'Cada acción que guardó o modificó algo: quién, cuándo, desde qué IP y si salió bien.'}
      </p>
      {view === 'changes' ? <ChangeLogView path="/school/audit/changes" /> : <ActivityLogView path="/school/audit/activity" />}
    </div>
  );
};
