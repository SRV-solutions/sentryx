import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import styles from './MyCourseDetail.module.css';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext'
const apiUrl = import.meta.env.VITE_API_URL;

const MyCourseDetail = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState(null);
  const { darkMode } = useTheme();
  const { authFetch } = useAuth();
  useEffect(() => {
    const fetchCursos = async () => {
      const userData = localStorage.getItem('user');
      const parsedUser = JSON.parse(userData);

      try {
        const res = await authFetch(`${apiUrl}/courses/me`, {
          headers: {
            Authorization: `Bearer ${parsedUser.token}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.status === 403) {
          setError('No tienes acceso a estos cursos.');
          return;
        }

        if (!res.ok) {
          const data = await res.json()
          setError(data ? data.message :'Ocurrió un error al cargar los cursos.');
          return;
        }

        const data = await res.json();
        setCourses(data);
      } catch (error) {
        setError('Error al conectar con el servidor.');
      }
    };

    fetchCursos();
  }, []);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!courses.length) return <p className={styles.loading}>Cargando cursos...</p>;

  return (
    <div className={`${styles.container} ${darkMode ? styles.darkContainer : ''}`}>
      <h1>Mis cursos</h1>

      <div className={styles.cards}>
        {courses.length !== 0 ?
          courses?.map((course, index) => (
            <div
              key={index}
              className={`${styles.card} ${darkMode ? styles.darkCard : ''}`}
              onClick={() => navigate(`/curso/${course.id}`)}
            >
              {course.thumbnailUrl && (
                <img
                  src={course.thumbnailUrl}
                  alt={`Miniatura de ${course.title}`}
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    objectFit: 'cover',
                    maxHeight: '160px',
                  }}
                />
              )}
              <h3>{course.title}</h3>
              <p><strong>Descripción:</strong> {course.description}</p>
              <p><strong>Inscripto desde:</strong> {new Date(course.grantedAt).toLocaleDateString()}</p>
            </div>
          )) : 'Usted no posee cursos aun'}

      </div>
    </div>
  );
};

export default MyCourseDetail;
