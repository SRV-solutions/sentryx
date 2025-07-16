import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import styles from './CourseDetail.module.css';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext'
import DescriptionPreview from '../components/DescriptionPreview';
import { Typography } from '@mui/material';

const apiUrl = import.meta.env.VITE_API_URL;

const CourseDetail = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const { darkMode } = useTheme();
  const { authFetch } = useAuth();

  useEffect(() => {
    const fetchCurso = async () => {
      const userData = localStorage.getItem('user');
      const parsedUser = JSON.parse(userData);

      try {
        const res = await authFetch(`${apiUrl}/courses/me/${courseId}`);

        if (res.status === 403) {
          setCourse({ error: 'No tienes acceso a este curso.' });
          return;
        }

        if (!res.ok) {
          setCourse({ error: 'Ocurrió un error al cargar el curso.' });
          return;
        }

        const data = await res.json();
        setCourse(data);
      } catch (error) {
        setCourse({ error: 'Error al conectar con el servidor.' });
      }
    };

    fetchCurso();
  }, [courseId]);

  if (!course) return <p className={styles.loading}>Cargando curso...</p>;
  if (course.error) return <p className={styles.error}>{course.error}</p>;

  return (
    <div className={`${styles.container} ${darkMode ? styles.darkContainer : ''}`}>
      <div className={`${styles.courseHeader} ${darkMode ? styles.darkCourseHeader : ''}`}>
        <h1>{course.title}</h1>
        <p>{course.description}</p>
      </div>

      <div className={styles.classList}>
        <h2>Clases</h2>
        {course.Modules && course.Modules.length > 0 ? (
          course.Modules.map((module) => (
            <div key={module.id} className={styles.moduleSection}>
              <h3>{module.title}</h3>
              <div className={styles.classesGrid}>
                {module.Lessons && module.Lessons.length > 0 ? (
                  module.Lessons.map((lesson) => (
                    <div
                      onClick={() => navigate(`/curso/${course.id}/modulo/${module.id}/clase/${lesson.id}`)}
                      key={lesson.id}
                      className={`${styles.card} ${darkMode ? styles.darkCard : ''}`}
                    >
                      <h4>{lesson.title}</h4>
                      <Typography variant="body2" noWrap sx={{ opacity: 0.8 }}>
                        <DescriptionPreview text={lesson.description} showExpanded={false} />
                      </Typography>                    </div>
                  ))
                ) : (
                  <p>No hay clases en este módulo.</p>
                )}
              </div>
            </div>
          ))
        ) : (
          <p>No hay módulos en este curso.</p>
        )}
      </div>
    </div>
  );
};

export default CourseDetail;
