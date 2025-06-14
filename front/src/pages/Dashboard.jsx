import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import NotificationList from '../components/NotificationList';
import styles from './Dashboard.module.css';
import MyCourseDetail from './MyCourseDetail';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { darkMode } = useTheme();

  return (
    <div className={`${styles.dashboardLayout} ${darkMode ? styles.dark : ''}`}>
      <div className={styles.dashboard}>
        <div className={styles.header}>
          <h1 className={styles.title}>Bienvenido, {user.firstName}</h1>
        </div>

        {/* CURSOS */}
        <div className={styles.section}>
          <MyCourseDetail></MyCourseDetail>
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
