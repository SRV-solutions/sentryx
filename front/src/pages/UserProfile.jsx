import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import styles from './UserProfile.module.css';

const UserProfile = () => {
  const { user } = useAuth();
  const { darkMode } = useTheme();

  if (!user) {
    return (
      <div className={`${styles.container} ${darkMode ? styles.darkContainer : ''}`}>
        <h2>No hay usuario autenticado</h2>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${darkMode ? styles.darkContainer : ''}`}>
      <h1 className={styles.title}>Perfil de Usuario</h1>
      <div className={`${styles.card} ${darkMode ? styles.darkCard : ''}`}>
        <p><strong>Nombre:</strong> {user.userData.firstName || 'N/A'}</p>
        <p><strong>Email:</strong> {user.userData.email}</p>
        <p><strong>Rol:</strong> {user.userData.roleName || 'Usuario'}</p>
      </div>
    </div>
  );
};

export default UserProfile;
