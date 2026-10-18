import { PageHeader } from '../../ui';
import { ChangeLogView } from '../../school/AuditViews';

/** Auditoría de toda la plataforma (equipo Sentryx): cambios e ingresos, incluidos los fallidos. */
export default function PlatformAuditPage() {
  return (
    <div className="stack-lg">
      <PageHeader title="Auditoría" subtitle="Cambios e ingresos de todos los colegios, con usuario, IP y fecha." />
      <ChangeLogView path="/platform/activity" showSchool />
    </div>
  );
}
