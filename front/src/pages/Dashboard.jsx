import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationList from '../components/NotificationList';
import Calendar from '../components/Calendar';
import Sidebar from '../components/SideBar';
import styles from './Dashboard.module.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { darkMode, toggleTheme } = useTheme();

  return (
    <div className={`${styles.dashboardLayout} ${darkMode ? styles.dark : ''}`}>
      <Sidebar />

      <div className={styles.dashboard}>
        <div className={styles.header}>
          <h1 className={styles.title}>Bienvenido, {user.name}</h1>
          <div>
            <button onClick={toggleTheme} className={styles.toggleBtn}>
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button className={styles.logoutBtn} onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </div>

        <div className={styles.cards}>
          <div className={styles.card}>
            <h3>Curso</h3>
            <p>{user.curso}</p>
          </div>
          <div className={`${styles.card} ${styles.green}`}>
            <h3>Asistencias</h3>
            <p>{user.asistencia}</p>
          </div>
          <div className={`${styles.card} ${styles.orange}`}>
            <h3>Profesor</h3>
            <p>{user.profesor}</p>
          </div>
        </div>

        <div className={styles.section}>
          <h3>Calendario Académico</h3>
          <div className={styles.calendar}>
            <Calendar />
          </div>
        </div>

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
