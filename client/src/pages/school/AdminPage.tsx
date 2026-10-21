/** Administración del colegio: cada pestaña está en pages/school/admin/. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSchool } from '../../school/SchoolContext';
import { PageHeader, Tabs } from '../../ui';
import { RolesMatrix } from '../../school/RolesMatrix';
import { Entity, Action } from '../../school/permissions';
import { InstitutionTab } from './admin/InstitutionTab';
import { StructureTab } from './admin/StructureTab';
import { GradingTab } from './admin/GradingTab';
import { StaffTab } from './admin/StaffTab';
import { StudentsAdminTab } from './admin/StudentsAdminTab';
import { AcademicYearTab } from './admin/AcademicYearTab';
import { AuditTab } from './admin/AuditTab';

export default function AdminPage() {
  const { can } = useSchool();
  const tabs = [
    ...(can(Entity.SCHOOL, Action.UPDATE) ? [{ value: 'school' as const, label: 'Institución' }, { value: 'structure' as const, label: 'Estructura' }] : []),
    // La conducción de un nivel (Rectoría, Dirección…) configura la calificación de su nivel aunque no edite la estructura.
    ...(can(Entity.GRADING_PERIODS, Action.UPDATE) ? [{ value: 'grading' as const, label: 'Calificaciones' }] : []),
    ...(can(Entity.SCHOOL, Action.UPDATE) ? [{ value: 'year' as const, label: 'Ciclo lectivo' }] : []),
    ...(can(Entity.USERS, Action.UPDATE) ? [{ value: 'staff' as const, label: 'Personal' }, { value: 'students' as const, label: 'Alumnos y familias' }] : []),
    { value: 'roles' as const, label: 'Roles y permisos' },
    ...(can(Entity.AUDIT_LOG, Action.READ) ? [{ value: 'audit' as const, label: 'Auditoría' }] : []),
  ];
  const [params] = useSearchParams();
  const alias: Record<string, string> = { calificaciones: 'grading', estructura: 'structure', personal: 'staff', alumnos: 'students', ciclo: 'year', auditoria: 'audit' };
  const wanted = alias[params.get('tab') ?? ''] ?? params.get('tab');
  const initial = tabs.find((t) => t.value === wanted)?.value;
  const [tab, setTab] = useState<(typeof tabs)[number]['value']>(initial ?? tabs[0]?.value ?? 'staff');
  return (
    <div className="stack-lg">
      <PageHeader title="Administración" subtitle="Estructura escolar, personal, alumnos y familias." />
      <Tabs value={tab} onChange={setTab} items={tabs} />
      {tab === 'school' && <InstitutionTab />}
      {tab === 'structure' && <StructureTab />}
      {tab === 'grading' && <GradingTab />}
      {tab === 'year' && <AcademicYearTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'students' && <StudentsAdminTab />}
      {tab === 'roles' && <RolesMatrix />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
