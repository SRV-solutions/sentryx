/** Tipos y piezas compartidas del legajo del personal y los recibos de sueldo. */
export type PositionKind = 'CARGO' | 'HORAS_CATEDRA' | 'MODULOS';
export type PositionSituation = 'TITULAR' | 'INTERINO' | 'SUPLENTE' | 'CONTRATADO';
export type ReceiptKind = 'SUELDO' | 'AGUINALDO' | 'VACACIONES' | 'OTRO';

export interface ScheduleSlot { day: number; from: string; to: string; label?: string }
export interface StaffPosition {
  id: number;
  userId: number;
  title: string;
  kind: PositionKind;
  situation: PositionSituation;
  weeklyHours: number;
  shift: string | null;
  levelId: number | null;
  startDate: string | null;
  endDate: string | null;
  schedule: ScheduleSlot[];
  notes: string | null;
  active: boolean;
  Level?: { id: number; name: string } | null;
}
export interface Receipt {
  id: number;
  userId: number;
  period: string;
  kind: ReceiptKind;
  netAmount: number | null;
  viewedAt: string | null;
  acknowledgedAt: string | null;
  agreed: boolean | null;
  observation: string | null;
  createdAt: string;
  User?: { id: number; firstName: string; lastName: string; dni: string | null };
}

export const KIND_LABELS: Record<PositionKind, string> = { CARGO: 'Cargo', HORAS_CATEDRA: 'Horas cátedra', MODULOS: 'Módulos' };
export const SITUATION_LABELS: Record<PositionSituation, string> = { TITULAR: 'Titular', INTERINO: 'Interino/a', SUPLENTE: 'Suplente', CONTRATADO: 'Contratado/a' };
export const RECEIPT_KIND_LABELS: Record<ReceiptKind, string> = { SUELDO: 'Sueldo', AGUINALDO: 'Aguinaldo', VACACIONES: 'Vacaciones', OTRO: 'Otro' };
export const DAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const SHIFTS = ['Mañana', 'Tarde', 'Vespertino', 'Noche', 'Jornada completa'];

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const periodLabel = (period: string) => `${MONTHS[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`;
export const currentPeriod = () => new Date().toISOString().slice(0, 7);
export const lastPeriods = (n = 14) => {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 7));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};

/** Horario semanal en columnas (lunes a sábado). */
export const WeeklySchedule = ({ positions }: { positions: Array<Pick<StaffPosition, 'title' | 'schedule'>> }) => {
  const slots = positions.flatMap((p) => p.schedule.map((s) => ({ ...s, title: s.label || p.title })));
  if (!slots.length) return <p className="small muted">Todavía no hay horario cargado.</p>;
  const days = [1, 2, 3, 4, 5, 6].filter((d) => d <= 5 || slots.some((s) => s.day === d));
  return (
    <div className="schedule" style={{ ['--days' as string]: days.length }}>
      {days.map((day) => (
        <div key={day} className="schedule-col">
          <div className="xs muted" style={{ fontWeight: 800 }}>{DAYS[day]}</div>
          {slots
            .filter((s) => s.day === day)
            .sort((a, b) => a.from.localeCompare(b.from))
            .map((s, i) => (
              <div key={i} className="schedule-slot" title={s.title}>
                {s.from}–{s.to}
                <div className="truncate" style={{ fontWeight: 600 }}>{s.title}</div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
};
