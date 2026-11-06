import { Navigate } from 'react-router-dom';
import { Solvix } from '../../tutorials/Solvix';
import { useSchool } from '../../school/SchoolContext';
import { Badge, Card, Empty, PageHeader } from '../../ui';

/** "Cobrar a estudiantes": todavía en desarrollo. Avisa que viene, sin prometer fechas ni funciones. */
export default function CollectionsSoonPage() {
  const { session, loading } = useSchool();
  if (!loading && !session?.isStaff) return <Navigate to="/inicio" replace />;
  return (
    <div className="page-narrow" style={{ margin: '0 auto', width: '100%' }}>
      <PageHeader title="Cobrar a estudiantes" actions={<Badge tone="accent">Próximamente</Badge>} />
      <Card>
        <Empty
          icon={<Solvix pose="wave" size={110} />}
          title="Estamos desarrollando esta sección"
          text="Muy pronto vas a poder cobrarles a tus estudiantes desde Sentryx. Te vamos a avisar cuando esté lista."
        />
      </Card>
    </div>
  );
}
