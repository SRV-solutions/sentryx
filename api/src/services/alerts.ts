import { Op } from 'sequelize';
import {
  Attendance,
  AttendanceRule,
  Alert,
  Enrollment,
  Division,
  Student,
  UserRole,
  StudentGuardian,
  AcademicYear,
} from '../models';
import { notify } from './notifications';
import { LEADERSHIP_ROLES } from '../constants/school';
import { RoleCode } from '../constants/roles';

type Record_ = { studentId: number; date: string; status: string; value: number; justified: boolean };

const metric = (rule: AttendanceRule, records: Record_[], today: string) => {
  const counted = records.filter((r) => r.status !== 'PRESENTE' && (rule.countJustified || !r.justified));
  switch (rule.type) {
    case 'TOTAL':
      return counted.reduce((s, r) => s + r.value, 0);
    case 'PERCENT': {
      if (!records.length) return 0;
      const total = counted.reduce((s, r) => s + r.value, 0);
      return Math.round((total / records.length) * 10000) / 100;
    }
    case 'WINDOW': {
      const from = new Date(today);
      from.setDate(from.getDate() - (rule.windowDays ?? 30));
      const fromStr = from.toISOString().slice(0, 10);
      return counted.filter((r) => r.date >= fromStr).reduce((s, r) => s + r.value, 0);
    }
    case 'CONSECUTIVE': {
      // Días hábiles registrados consecutivos con AUSENTE, contando desde el último registro hacia atrás.
      let n = 0;
      for (let i = records.length - 1; i >= 0; i--) {
        const r = records[i];
        if (r.status === 'AUSENTE' && (rule.countJustified || !r.justified)) n++;
        else break;
      }
      return n;
    }
  }
};

const unit = (rule: AttendanceRule) => (rule.type === 'PERCENT' ? '%' : rule.type === 'CONSECUTIVE' ? ' días seguidos' : ' faltas');

/** Personal a avisar ante una alerta nueva: preceptoría y conducción del nivel/división. */
const staffToNotify = async (schoolId: number, levelId: number, divisionId: number) => {
  const members = await UserRole.findAll({
    where: {
      schoolId,
      active: true,
      role: { [Op.in]: [RoleCode.PRECEPTOR, ...LEADERSHIP_ROLES] },
      [Op.or]: [{ levelId: null }, { levelId }],
    },
    attributes: ['userId', 'role', 'divisionIds'],
  });
  return members
    .filter((m) => m.role !== RoleCode.PRECEPTOR || !m.divisionIds?.length || m.divisionIds.includes(divisionId))
    .map((m) => m.userId as number);
};

/**
 * Evalúa las reglas activas para un conjunto de alumnos: crea alertas nuevas, actualiza el valor
 * de las abiertas y resuelve automáticamente las que dejaron de cumplirse (ej: se justificó la falta).
 */
export const evaluateAlerts = async (schoolId: number, studentIds?: number[]) => {
  const year = await AcademicYear.findOne({ where: { schoolId, isCurrent: true } });
  if (!year) return { created: 0, resolved: 0 };

  const enrollments = await Enrollment.findAll({
    where: { academicYearId: year.id, status: 'ACTIVE', ...(studentIds ? { studentId: studentIds } : {}) },
    include: [
      { model: Division, attributes: ['id', 'name', 'levelId'] },
      { model: Student, attributes: ['id', 'firstName', 'lastName'], where: { schoolId, active: true } },
    ],
  });
  if (!enrollments.length) return { created: 0, resolved: 0 };
  const ids = enrollments.map((e) => e.studentId as number);

  const [rules, records, openAlerts] = await Promise.all([
    AttendanceRule.findAll({ where: { schoolId, active: true } }),
    Attendance.findAll({
      where: { studentId: ids, date: { [Op.between]: [year.startDate, year.endDate] } },
      attributes: ['studentId', 'date', 'status', 'value', 'justified'],
      order: [['date', 'ASC']],
    }),
    Alert.findAll({ where: { schoolId, studentId: ids, status: { [Op.ne]: 'RESOLVED' } } }),
  ]);

  const byStudent = new Map<number, Record_[]>();
  for (const r of records) {
    const list = byStudent.get(r.studentId as number) ?? [];
    list.push({ studentId: r.studentId as number, date: r.date, status: r.status, value: r.value, justified: r.justified });
    byStudent.set(r.studentId as number, list);
  }
  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let resolved = 0;

  for (const e of enrollments) {
    const division = e.Division!;
    const student = e.Student!;
    const recs = byStudent.get(student.id) ?? [];
    for (const rule of rules.filter((r) => !r.levelId || r.levelId === division.levelId)) {
      const value = metric(rule, recs, today) ?? 0;
      const open = openAlerts.find((a) => a.studentId === student.id && a.ruleId === rule.id);
      const triggered = value >= rule.threshold;

      if (triggered && open) {
        if (open.value !== value) await open.update({ value });
      } else if (triggered) {
        await Alert.create({
          schoolId,
          studentId: student.id,
          ruleId: rule.id,
          severity: rule.severity,
          value,
          message: `${student.lastName}, ${student.firstName} (${division.name}): ${rule.name} — ${value}${unit(rule)}`,
          note: null,
          handledById: null,
          handledAt: null,
        });
        created++;
        const staff = await staffToNotify(schoolId, division.levelId as number, division.id);
        notify({
          userIds: staff,
          title: `Alerta de asistencia · ${division.name}`,
          message: `${student.firstName} ${student.lastName}: ${rule.name} (${value}${unit(rule)}).`,
          type: 'alert',
          link: '/alertas',
          email: rule.severity === 'CRITICAL' ? 'fallback' : 'never',
        });
        if (rule.notifyGuardians) {
          const guardians = await StudentGuardian.findAll({ where: { studentId: student.id, receivesCommunications: true }, attributes: ['userId'], raw: true });
          notify({
            userIds: guardians.map((g) => g.userId as number),
            title: 'Aviso de asistencia',
            message: `${student.firstName} registra ${value}${unit(rule)}. Ante cualquier consulta escribile a preceptoría desde Mensajes.`,
            type: 'attendance',
            link: '/familia',
          });
        }
      } else if (open) {
        await open.update({ status: 'RESOLVED', handledAt: new Date(), note: 'Resuelta automáticamente: dejó de cumplirse la regla.' });
        resolved++;
      }
    }
  }
  return { created, resolved };
};

/** Ejecuta la evaluación en segundo plano (no demora la respuesta de quien carga asistencia). */
export const evaluateAlertsInBackground = (schoolId: number, studentIds?: number[]) => {
  void evaluateAlerts(schoolId, studentIds).catch((err) => console.error('[alerts]', err));
};
