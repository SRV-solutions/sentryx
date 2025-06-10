import { useAuth } from '../context/AuthContext';
import styles from './UserProfile.module.css';

const UserProfile = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className={styles.container}>
        <h2>No hay usuario autenticado</h2>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Perfil de Usuario</h1>
      <div className={styles.card}>
        <p><strong>Nombre:</strong> {user.userData.firstName || 'N/A'}</p>
        <p><strong>Email:</strong> {user.userData.email}</p>
        <p><strong>Rol:</strong> {user.userData.roleName || 'Usuario'}</p>
        {/* Podés agregar más campos según lo que devuelve tu backend */}
      </div>
    </div>
  );
};

export default UserProfile;
