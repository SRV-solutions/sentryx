import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, CheckCircle2, Circle } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { Avatar, Chips, Empty, ErrorBox, PageHeader, Skeleton, useToast, fullName, Badge } from '../../ui';
import { ATTENDANCE_LABELS, type AttendanceStatus, type PersonLite } from '../../school/types';

interface TodayRow { division: { id: number; name: string; levelId: number }; taken: boolean; recorded: number; absent: number }
interface DivisionDay {
  division: { id: number; name: string };
  date: string;
  taken: boolean;
  students: Array<{ student: PersonLite; status: AttendanceStatus; justified: boolean; note: string | null; recordId: number | null }>;
}

const CYCLE: AttendanceStatus[] = ['PRESENTE', 'AUSENTE', 'TARDE', 'RETIRO'];
const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export default function AttendancePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [date, setDate] = useState(localToday());
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<number, { status: AttendanceStatus; justified: boolean }>>({});

  const today = useQuery({ queryKey: ['attendance-today', date], queryFn: () => apiGet<TodayRow[]>(`/school/attendance/today?date=${date}`) });
  useEffect(() => {
    if (!divisionId && today.data?.length) setDivisionId((today.data.find((d) => !d.taken) ?? today.data[0]).division.id);
  }, [today.data, divisionId]);

  const day = useQuery({
    queryKey: ['attendance-day', divisionId, date],
    queryFn: () => apiGet<DivisionDay>(`/school/attendance/division/${divisionId}?date=${date}`),
    enabled: !!divisionId,
  });
  useEffect(() => {
    if (day.data) setRows(Object.fromEntries(day.data.students.map((s) => [s.student.id, { status: s.status, justified: s.justified }])));
  }, [day.data]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { PRESENTE: 0, AUSENTE: 0, TARDE: 0, RETIRO: 0 };
    Object.values(rows).forEach((r) => c[r.status]++);
    return c;
  }, [rows]);

  const save = useMutation({
    mutationFn: () =>
      apiSend('PUT', `/school/attendance/division/${divisionId}`, {
        date,
        records: Object.entries(rows).map(([studentId, r]) => ({ studentId: Number(studentId), status: r.status, justified: r.justified })),
      }),
    onSuccess: () => {
      toast('Asistencia guardada ✅');
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-day', divisionId, date] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      // Pasa sola a la próxima división pendiente: menos toques para preceptoría.
      const next = today.data?.find((d) => !d.taken && d.division.id !== divisionId);
      if (next) setDivisionId(next.division.id);
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const cycle = (id: number) =>
    setRows((prev) => {
      const cur = prev[id]?.status ?? 'PRESENTE';
      const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      return { ...prev, [id]: { status: next, justified: next === 'PRESENTE' ? false : prev[id]?.justified ?? false } };
    });

  return (
    <div className="stack" style={{ paddingBottom: 80 }}>
      <PageHeader
        title="Asistencia"
        subtitle="Todos empiezan presentes: tocá el estado para marcar ausente, tarde o retiro."
        actions={<input type="date" className="input" style={{ width: 170 }} value={date} max={localToday()} onChange={(e) => (setDate(e.target.value), setDivisionId(null))} />}
      />
      {today.error && <ErrorBox error={today.error} />}
      {today.isLoading && <Skeleton count={1} h={40} />}
      {today.data && !today.data.length && <Empty title="No tenés divisiones a cargo" />}
      {today.data && today.data.length > 0 && (
        <Chips
          value={divisionId ?? 0}
          onChange={setDivisionId}
          items={today.data.map((d) => ({
            value: d.division.id,
            label: (
              <span className="row" style={{ gap: 6 }}>
                {d.taken ? <CheckCircle2 size={14} color="var(--ok)" /> : <Circle size={14} />} {d.division.name}
              </span>
            ),
          }))}
        />
      )}

      {day.isLoading && <Skeleton count={6} h={56} />}
      {day.data && (
        <>
          <div className="row wrap" style={{ gap: 6 }}>
            {day.data.taken ? <Badge tone="ok">Ya tomada · podés corregir</Badge> : <Badge tone="warn">Pendiente</Badge>}
            <Badge>{counts.PRESENTE} presentes</Badge>
            {counts.AUSENTE > 0 && <Badge tone="danger">{counts.AUSENTE} ausentes</Badge>}
            {counts.TARDE > 0 && <Badge tone="warn">{counts.TARDE} tarde</Badge>}
            {counts.RETIRO > 0 && <Badge tone="info">{counts.RETIRO} retiro</Badge>}
          </div>
          <div className="card list" style={{ overflow: 'hidden' }}>
            {day.data.students.map(({ student }) => {
              const r = rows[student.id] ?? { status: 'PRESENTE', justified: false };
              return (
                <div key={student.id} className="list-item">
                  <Avatar name={fullName(student)} src={student.photoUrl} size="sm" />
                  <div className="grow">
                    <div className="h3 truncate">{student.lastName}, {student.firstName}</div>
                    {r.status !== 'PRESENTE' && (
                      <label className="xs row" style={{ gap: 6, marginTop: 2 }}>
                        <input type="checkbox" checked={r.justified} onChange={(e) => setRows((p) => ({ ...p, [student.id]: { ...r, justified: e.target.checked } }))} /> Justificada
                      </label>
                    )}
                  </div>
                  <button className={`att-btn att-${r.status}`} onClick={() => cycle(student.id)} aria-label={`Estado de ${fullName(student)}: ${ATTENDANCE_LABELS[r.status]}`}>
                    {ATTENDANCE_LABELS[r.status]}
                  </button>
                </div>
              );
            })}
          </div>
          <button className="btn btn-accent fab" onClick={() => save.mutate()} disabled={save.isPending || !day.data.students.length}>
            <Save size={18} /> {save.isPending ? 'Guardando…' : `Guardar ${day.data.division.name}`}
          </button>
        </>
      )}
    </div>
  );
}
