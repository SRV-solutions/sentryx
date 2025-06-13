import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import styles from './CourseDetail.module.css';

const apiUrl = import.meta.env.VITE_API_URL;

const CourseDetail = () => {
    const { id } = useParams();
    const [course, setCourse] = useState(null);

    useEffect(() => {
        const fetchCurso = async () => {
            const userData = localStorage.getItem('user');
            const parsedUser = JSON.parse(userData)

            try {
                const res = await fetch(`${apiUrl}/courses/me/${id}`, {
                    headers: {
                        Authorization: `Bearer ${parsedUser.token}`,
                        'Content-Type': 'application/json',
                    },
                });

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
    }, [id]);

    if (!course) return <p className={styles.loading}>Cargando curso...</p>;
    if (course.error) return <p className={styles.error}>{course.error}</p>;
    console.log(course);
    
    return (
        <div className={styles.container}>
            <div className={styles.courseHeader}>
                <h1>{course.title}</h1>
                <p>{course.description}</p>
            </div>

            <div className={styles.classList}>
                <h2>Clases</h2>
                <div className={styles.classesGrid}>
                    {course.Lessons.map((lesson) => (
                        <div key={lesson.id} className={styles.card}>
                            <h3>{lesson.title}</h3>
                            <p>{lesson.description || 'Sin descripción disponible.'}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CourseDetail;
