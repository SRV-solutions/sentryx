import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Empty } from '../../ui';

/** La cuenta existe pero ningún colegio le dio acceso (o se lo desactivaron). */
export default function NoSchoolPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Empty
      icon={<Building2 size={40} strokeWidth={1.5} />}
      title="Tu cuenta no tiene un colegio asignado"
      text="Sentryx funciona dentro de cada institución. Pedile a la secretaría de tu colegio que te dé acceso; si ya lo tenías, puede que lo hayan desactivado."
      action={<button className="btn btn-ghost" onClick={() => (logout(), navigate('/login', { replace: true }))}>Cerrar sesión</button>}
    />
  );
}
