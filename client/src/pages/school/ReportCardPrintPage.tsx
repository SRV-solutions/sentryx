import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { ReportCardView } from '../../school/ReportCardView';
import { ErrorBox, Skeleton, fmtDate } from '../../ui';
import type { ReportCard } from '../../school/types';

/** Boletín listo para imprimir o "Guardar como PDF" desde el navegador (sin generar PDFs en el servidor). */
export default function ReportCardPrintPage() {
  const id = Number(useParams().id);
  const { session } = useSchool();
  const q = useQuery({ queryKey: ['report-card', id], queryFn: () => apiGet<ReportCard>(`/school/grades/report-card/${id}`) });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Skeleton count={1} h={300} />;
  const d = q.data;
  return (
    <div className="stack-lg">
      <div className="row-between no-print">
        <span className="small muted">Usá "Guardar como PDF" en el diálogo de impresión para descargarlo.</span>
        <button className="btn" onClick={() => window.print()}><Printer size={18} /> Imprimir</button>
      </div>
      <header className="row-between" style={{ borderBottom: '2px solid var(--text)', paddingBottom: 12 }}>
        <div>
          <div className="h2">{session?.school.name}</div>
          <div className="small muted">Boletín de calificaciones · {d.level.name}</div>
        </div>
        <img src="https://wearesrv.com/srv-logo-96.webp" alt="" width={40} height={40} />
      </header>
      <div className="row wrap" style={{ gap: 24 }}>
        <div><div className="xs muted">Alumno/a</div><div className="h3">{d.student.lastName}, {d.student.firstName}</div></div>
        {d.student.dni && <div><div className="xs muted">DNI</div><div className="h3">{d.student.dni}</div></div>}
        <div><div className="xs muted">División</div><div className="h3">{d.division.name}</div></div>
        <div><div className="xs muted">Emitido</div><div className="h3">{fmtDate(new Date())}</div></div>
      </div>
      <ReportCardView data={d} />
      <div className="row" style={{ justifyContent: 'space-around', marginTop: 48, gap: 24 }}>
        {['Firma Docente/Preceptor', 'Firma Dirección', 'Firma Familia'].map((t) => (
          <div key={t} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ borderTop: '1px solid var(--text-3)', paddingTop: 6 }} className="xs muted">{t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
