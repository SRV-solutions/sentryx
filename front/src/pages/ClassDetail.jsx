import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext'
const apiUrl = import.meta.env.VITE_API_URL;

const ClassDetail = () => {
    const { courseId, classId } = useParams();
    const { darkMode } = useTheme();
    const { authFetch } = useAuth();

    const [lesson, setLesson] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const fetchLesson = async () => {
            try {
                const userData = localStorage.getItem('user');
                if (!userData) throw new Error('Usuario no autenticado');

                const parsedUser = JSON.parse(userData);

                const res = await authFetch(`${apiUrl}/courses/me/${courseId}/lessons/${classId}`, {
                    headers: {
                        Authorization: `Bearer ${parsedUser.token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (res.status === 403) {
                    setErrorMsg('No tenés acceso a este curso');
                    return;
                }

                if (res.status === 404) {
                    setErrorMsg('Lección no encontrada');
                    return;
                }

                if (!res.ok) throw new Error('Error al obtener la lección');

                const data = await res.json();
                setLesson(data);
            } catch (err) {
                console.error(err);
                setErrorMsg('Ocurrió un error al cargar la clase.');
            } finally {
                setLoading(false);
            }
        };

        fetchLesson();
    }, [courseId, classId]);

    if (loading) return <p style={{ padding: '2rem' }}>Cargando clase...</p>;
    if (errorMsg) return <p style={{ color: 'red', padding: '2rem' }}>{errorMsg}</p>;
    if (!lesson) return null;

    const themeStyles = {
        backgroundColor: darkMode ? '#121212' : '#f5f5f5',
        color: darkMode ? '#ffffff' : '#222222',
        transition: 'all 0.3s ease',
        minHeight: '100vh',
        padding: '2rem',
        fontFamily: 'Segoe UI, Roboto, sans-serif',
    };

    const cardStyle = {
        backgroundColor: darkMode ? '#1f1f1f' : '#ffffff',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: darkMode
            ? '0 4px 12px rgba(0, 0, 0, 0.6)'
            : '0 4px 12px rgba(0, 0, 0, 0.1)',
        maxWidth: '900px',
        margin: '0 auto',
    };

    const titleStyle = {
        fontSize: '2rem',
        marginBottom: '0.5rem',
        borderBottom: `2px solid ${darkMode ? '#444' : '#ccc'}`,
        paddingBottom: '0.5rem',
    };

    const descriptionStyle = {
        fontSize: '1.1rem',
        color: darkMode ? '#bbbbbb' : '#555555',
        marginBottom: '2rem',
        lineHeight: '1.6',
    };

    return (
        <div style={themeStyles}>
            <div style={cardStyle}>
                <h1 style={titleStyle}>{lesson.title}</h1>

                {lesson.description && (
                    <p style={descriptionStyle}>{lesson.description}</p>
                )}

                <div style={{ marginBottom: '2rem' }}>
                    <iframe
                        width="100%"
                        height="500"
                        src={`https://www.youtube.com/embed/${extractYoutubeId(lesson.youtubeUrl)}`}
                        title={lesson.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        style={{ borderRadius: '10px' }}
                    />
                </div>
            </div>
        </div>
    );
};

// Extrae el ID del video desde la URL de YouTube
function extractYoutubeId(url) {
    const regex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^\s&?/]+)/;
    const match = url?.match(regex);
    return match ? match[1] : '';
}

export default ClassDetail;
