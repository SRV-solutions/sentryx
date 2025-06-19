import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useVideoPlayer } from '../context/VideoPlayerContext';
import ReactPlayer from 'react-player';
import LessonComments from '../components/LessonComments.jsx';
import {
  Box,
  Typography,
  Paper,
  Divider,
  Button,
} from '@mui/material';

const apiUrl = import.meta.env.VITE_API_URL;

const ClassDetail = () => {
  const { courseId, classId, moduleId } = useParams();
  const { darkMode } = useTheme();
  const { authFetch } = useAuth();
  const { setVideoData } = useVideoPlayer();

  const [course, setCourse] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [relatedLessons, setRelatedLessons] = useState([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const playerRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = JSON.parse(localStorage.getItem('user'));
        if (!userData) throw new Error('Usuario no autenticado');

        const [lessonRes, allLessonsRes] = await Promise.all([
          authFetch(`${apiUrl}/courses/me/${courseId}/module/${moduleId}/lessons/${classId}`),
          authFetch(`${apiUrl}/courses/me/${courseId}`),
        ]);

        if (!lessonRes.ok || !allLessonsRes.ok) throw new Error('Error al obtener datos');

        const lessonData = await lessonRes.json();
        const allLessonsData = await allLessonsRes.json();

        setLesson(lessonData);
        setVideoUrl(lessonData.videoUrl);
        setVideoData({ url: lessonData.videoUrl, title: lessonData.title, classPath: `/curso/${courseId}/modulo/${moduleId}/clase/${classId}` });

        const allLessons = allLessonsData.Modules.flatMap((mod) =>
          mod.Lessons.map((lesson) => ({ ...lesson, moduleId: mod.id }))
        );

        const filtered = allLessons.filter((l) => l.id !== lessonData.id);
        setCourse(allLessonsData)
        setRelatedLessons(filtered);
        setRelatedLessons(filtered);
      } catch (err) {
        console.error(err);
        setErrorMsg('Ocurrió un error al cargar la clase.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [courseId, classId, moduleId]);

  useEffect(() => {
    const trySeekToSavedTime = () => {
      const stored = localStorage.getItem('resumeTime');
      if (stored) {
        const { path, time } = JSON.parse(stored);
        if (path === window.location.pathname && playerRef.current) {
          playerRef.current.seekTo(time, 'seconds');
        }
      }
    };

    // Esperamos a que el player esté listo (puede tomar un pelín de tiempo)
    const timeout = setTimeout(trySeekToSavedTime, 500);

    return () => clearTimeout(timeout);
  }, []);

  const previousClassIdRef = useRef(classId);

  useEffect(() => {
    return () => {
      const currentTime = playerRef.current?.getCurrentTime?.();
      if (currentTime && videoUrl) {
        localStorage.setItem(
          'resumeTime',
          JSON.stringify({
            path: `/curso/${courseId}/modulo/${moduleId}/clase/${previousClassIdRef.current}`,
            time: currentTime,
          })
        );
      }
    };
  }, [classId]); // Se ejecuta cuando classId cambia

  useEffect(() => {
    previousClassIdRef.current = classId;
  }, [classId]);


  if (loading) return <p style={{ padding: '2rem' }}>Cargando clase...</p>;
  if (errorMsg) return <p style={{ color: 'red', padding: '2rem' }}>{errorMsg}</p>;
  if (!lesson) return null;

  return (
    <Box
      sx={{
        backgroundColor: darkMode ? '#121212' : '#f5f5f5',
        color: darkMode ? '#fff' : '#000',
        minHeight: '100vh',
        p: 2,
        display: 'flex',
        gap: 3,
        flexDirection: { xs: 'column', md: 'row' },
      }}
    >
      {/* Columna izquierda: Video + Comentarios */}
      <Box sx={{ flex: 3 }}>
        <Paper
          elevation={3}
          sx={{
            borderRadius: 3,
            p: 3,
            backgroundColor: darkMode ? '#1f1f1f' : '#fff',
          }}
        >
          <Typography variant="h4" gutterBottom>
            {lesson.title}
          </Typography>
          {lesson.description && (
            <Typography
              sx={{ mb: 2, color: darkMode ? '#bbb' : '#555', lineHeight: 1.6 }}
            >
              {lesson.description}
            </Typography>
          )}

          {videoUrl ? (
            <ReactPlayer
              ref={playerRef}
              url={videoUrl}
              controls
              width="100%"
              height="500px"
              playing
              config={{
                file: {
                  attributes: {
                    controlsList: 'nodownload',
                    onContextMenu: e => e.preventDefault(),
                  },
                },
              }}
            />
          ) : (
            <Typography color="warning.main">
              El video no está disponible.
            </Typography>
          )}

          <LessonComments lessonId={lesson.id} />
        </Paper>
      </Box>

      {/* Columna derecha: Videos relacionados */}
      <Box sx={{ flex: 1, minWidth: '300px' }}>
        <Typography variant="h6" gutterBottom>
          Más clases del curso
        </Typography>
        <Divider sx={{ mb: 2 }} />
        {relatedLessons.map((l) => (
          <Paper
            key={l.id}
            sx={{
              p: 1,
              mb: 2,
              backgroundColor: darkMode ? '#2a2a2a' : '#fafafa',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              '&:hover': {
                boxShadow: darkMode
                  ? '0 0 10px rgba(255,255,255,0.1)'
                  : '0 0 10px rgba(0,0,0,0.1)',
              },
            }}
          >
            <Link
              to={`/curso/${courseId}/modulo/${l.moduleId}/clase/${l.id}`}
              style={{ textDecoration: 'none', display: 'flex', gap: 10, alignItems: 'center' }}
            >
              <img
                src={course?.thumbnailUrl || 'https://via.placeholder.com/120x70?text=Sin+imagen'}
                alt={l.title}
                style={{ width: 120, height: 70, borderRadius: 8, objectFit: 'cover' }}
              />
              <Typography variant="body1" sx={{ color: darkMode ? '#fff' : '#000' }}>
                {l.title}
              </Typography>
            </Link>
          </Paper>
        ))}
      </Box>
    </Box>
  );
};

export default ClassDetail;
