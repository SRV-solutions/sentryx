import { ConductRecord, StudentGuardian, User, UserRole, Subject, Division } from '../models';
import { CONDUCT_KIND_LABELS, ConductKind } from '../constants/school';
import { RoleCode } from '../constants/roles';
import { notify } from './notifications';

/** Convivencia: forma pública de cada registro y avisos a la familia. Los registros nunca se editan ni se borran. */

export interface ConductRow {
  id: number;
  occurredOn: string;
  kind: ConductKind;
  kindLabel: string;
  quantity: number | null;
  description: string;
  measures: string | null;
  visibleToFamily: boolean;
  subject: { id: number; name: string } | null;
  division: { id: number; name: string } | null;
  createdAt: Date;
  createdBy: { id: number; firstName: string; lastName: string } | null;
  notifiedAt: Date | null;
  refId: number | null;
  rectifications: ConductRow[];
}

type WithIncludes = ConductRecord & { Subject?: Subject | null; Division?: Division | null };

/** Includes para armar ConductRow en la misma consulta (autor, materia y curso). */
export const CONDUCT_INCLUDES = [
  { model: User, as: 'CreatedBy', attributes: ['id', 'firstName', 'lastName'] },
  { model: Subject, attributes: ['id', 'name'] },
  { model: Division, attributes: ['id', 'name'] },
];

export const toConductRow = (r: WithIncludes): ConductRow => ({
  id: r.id,
  occurredOn: r.occurredOn,
  kind: r.kind,
  kindLabel: CONDUCT_KIND_LABELS[r.kind] ?? r.kind,
  quantity: r.quantity,
  description: r.description,
  measures: r.measures,
  visibleToFamily: r.visibleToFamily,
  subject: r.Subject ? { id: r.Subject.id, name: r.Subject.name } : null,
  division: r.Division ? { id: r.Division.id, name: r.Division.name } : null,
  createdAt: r.createdAt,
  createdBy: r.CreatedBy ? { id: r.CreatedBy.id, firstName: r.CreatedBy.firstName, lastName: r.CreatedBy.lastName } : null,
  notifiedAt: r.notifiedAt,
  refId: r.refId,
  rectifications: [],
});

/**
 * Historial en árbol: originales (más nuevos primero) con sus rectificaciones adentro (en orden de carga).
 * Una rectificación cuyo original no se ve (registro interno) no se muestra: suelta revelaría que el original
 * existe (las nuevas ya heredan "interno"; esto cubre las cargadas antes del arreglo).
 */
export const conductTree = (records: WithIncludes[]) => {
  const rows = records.map(toConductRow);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const top: ConductRow[] = [];
  for (const r of rows) {
    if (r.kind === 'RECTIFICACION' && r.refId) {
      const parent = byId.get(r.refId);
      if (parent && parent !== r) parent.rectifications.push(r);
      continue;
    }
    top.push(r);
  }
  const newest = (a: ConductRow, b: ConductRow) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id;
  top.sort(newest);
  top.forEach((r) => r.rectifications.sort((a, b) => a.id - b.id));
  return top;
};

/**
 * Resumen del ciclo actual: amonestaciones acumuladas, días de suspensión y cantidad por tipo.
 * Una rectificación con cantidad reemplaza la del original (vale la última cargada); sin cantidad no cambia el número.
 * Se calcula sobre lo que ve quien consulta: una rectificación cuyo original no ve no cuenta.
 */
export const conductSummary = (records: ConductRecord[], academicYearId: number | null) => {
  const summary = { amonestaciones: 0, suspensionDays: 0, byKind: {} as Partial<Record<ConductKind, number>> };
  const ids = new Set(records.map((r) => r.id));
  const corrected = new Map<number, { id: number; quantity: number }>();
  for (const r of records) {
    if (r.kind !== 'RECTIFICACION' || !r.refId || r.quantity == null) continue;
    const prev = corrected.get(r.refId);
    if (!prev || r.id > prev.id) corrected.set(r.refId, { id: r.id, quantity: r.quantity });
  }
  for (const r of records) {
    if (!academicYearId || r.academicYearId !== academicYearId) continue;
    if (r.kind === 'RECTIFICACION' && (!r.refId || !ids.has(r.refId))) continue;
    summary.byKind[r.kind] = (summary.byKind[r.kind] ?? 0) + 1;
    const quantity = corrected.get(r.id)?.quantity ?? r.quantity ?? 0;
    if (r.kind === 'AMONESTACION') summary.amonestaciones += quantity;
    if (r.kind === 'SUSPENSION') summary.suspensionDays += quantity;
  }
  return summary;
};

/** "2 amonestaciones", "3 días de suspensión" o el nombre del tipo. */
const kindPhrase = (kind: ConductKind, quantity: number | null) => {
  if (kind === 'AMONESTACION' && quantity) return quantity === 1 ? '1 amonestación' : `${quantity} amonestaciones`;
  if (kind === 'SUSPENSION' && quantity) return `suspensión de ${quantity} ${quantity === 1 ? 'día' : 'días'}`;
  return CONDUCT_KIND_LABELS[kind].toLowerCase();
};

/**
 * Aviso después del commit: familias activas que reciben comunicaciones (campana + push + email) y la cuenta
 * del estudiante si tiene (solo in-app). Devuelve cuántas personas se avisaron.
 */
export const notifyConduct = async (
  schoolId: number,
  student: { id: number; firstName: string; lastName: string; userId: number | null },
  record: { kind: ConductKind; quantity: number | null; occurredOn: string }
) => {
  const [guardians, studentRole] = await Promise.all([
    StudentGuardian.findAll({
      where: { studentId: student.id, receivesCommunications: true },
      attributes: ['userId'],
      include: [{ model: User, where: { isActive: true }, attributes: [] }],
      raw: true,
    }),
    student.userId ? UserRole.findOne({ where: { userId: student.userId, schoolId, role: RoleCode.ESTUDIANTE, active: true }, attributes: ['id'] }) : null,
  ]);
  const what = kindPhrase(record.kind, record.quantity);
  const date = record.occurredOn.split('-').reverse().join('/');
  const link = `/familia/${student.id}?tab=convivencia`;
  const guardianIds = guardians.map((g) => g.userId as number);
  notify({
    userIds: guardianIds,
    title: `Convivencia: nuevo registro de ${student.firstName}`,
    message: `Se registró ${what} de ${student.firstName} ${student.lastName} (${date}). Entrá a Sentryx para ver el detalle.`,
    type: 'conduct',
    link,
    email: 'always',
  });
  if (studentRole && student.userId) {
    notify({ userIds: [student.userId], title: 'Convivencia: nuevo registro', message: `Se registró ${what} (${date}). Mirá el detalle en tu perfil.`, type: 'conduct', link, email: 'never' });
  }
  return guardianIds.length + (studentRole ? 1 : 0);
};
