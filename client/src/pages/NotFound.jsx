import { Link } from 'react-router-dom';
import styles from './NotFound.module.css';

const NotFound = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>404</h1>
      <p className={styles.message}>Página no encontrada</p>
      <Link to="/dashboard" className={styles.link}>Volver al inicio</Link>
    </div>
  );
};

export default NotFound;
