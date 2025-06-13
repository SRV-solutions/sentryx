import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import NotificationList from '../components/NotificationList';
import styles from './Dashboard.module.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { darkMode, toggleTheme } = useTheme();

  return (
    <div className={`${styles.dashboardLayout} ${darkMode ? styles.dark : ''}`}>
      <div className={styles.dashboard}>
        <div className={styles.header}>
          <h1 className={styles.title}>Bienvenido, {user.firstName}</h1>
          <div>
            <button onClick={toggleTheme} className={styles.toggleBtn}>
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* CURSOS */}
        <div className={styles.section}>
          <h3>Tus Cursos</h3>
          <div className={styles.cards}>
            {user.userData.courses.length !== 0 ?
             user.userData.courses?.map(({ Course, grantedAt }, index) => (
              <div
                key={index}
                className={styles.card}
                onClick={() => navigate(`/curso/${Course.id}`)}
                style={{ cursor: 'pointer' }}
              >
                {Course.thumbnailUrl && (
                  <img
                    src={Course.thumbnailUrl}
                    alt={`Miniatura de ${Course.title}`}
                    style={{
                      width: '100%',
                      borderRadius: '8px',
                      marginBottom: '1rem',
                      objectFit: 'cover',
                      maxHeight: '160px',
                    }}
                  />
                )}
                <h3>{Course.title}</h3>
                <p><strong>Descripción:</strong> {Course.description}</p>
                <p><strong>Inscripto desde:</strong> {new Date(grantedAt).toLocaleDateString()}</p>
              </div>
            )) : 'Usted no posee cursos aun'}

          </div>
        </div>

        {/* CALENDARIO */}
        {/* <div className={styles.section}>
          <h3>Calendario Académico</h3>
          <div className={styles.calendar}>
            <Calendar />
          </div>
        </div> */}

        {/* NOTIFICACIONES */}
        <div className={styles.section}>
          <h3>Notificaciones</h3>
          <div className={styles.notifications}>
            <NotificationList />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
