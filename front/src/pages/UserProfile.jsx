import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import styles from './UserProfile.module.css';
import ChangePassword from '../components/ChangePassword';

const UserProfile = () => {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const [showChangePassword, setShowChangePassword] = useState(false);

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
        <p><strong>Apellido:</strong> {user.userData.lastName || 'N/A'}</p>
        <p><strong>Email:</strong> {user.userData.email}</p>
        <p><strong>Rol:</strong> {user.userData.roleName || 'Usuario'}</p>

        <button
          className={styles.updatePasswordBtn}
          onClick={() => setShowChangePassword(true)}
        >
          Actualizar contraseña
        </button>
      </div>

      {showChangePassword && (
        <div
          className={`${styles.modalBackdrop}`}
          onClick={() => setShowChangePassword(false)}
        >
          <div
            className={`${styles.modalContent} ${darkMode ? styles.darkModalContent : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={styles.modalCloseBtn}
              onClick={() => setShowChangePassword(false)}
            >
              &times;
            </button>
            <ChangePassword onClose={() => setShowChangePassword(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
