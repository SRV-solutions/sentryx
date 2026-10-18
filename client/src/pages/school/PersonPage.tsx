import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PersonProfile } from '../../school/PersonProfile';

export default function PersonPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  return (
    <div className="stack page-narrow" style={{ margin: '0 auto', width: '100%' }}>
      <Link
        to="/personas"
        className="row small muted"
        onClick={(e) => {
          // Volver respeta la búsqueda/filtros anteriores si se llegó desde el directorio.
          if (window.history.length > 1) {
            e.preventDefault();
            navigate(-1);
          }
        }}
      >
        <ArrowLeft size={16} /> Volver
      </Link>
      <PersonProfile userId={id} />
    </div>
  );
}
