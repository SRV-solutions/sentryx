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
  Slider,
  Stack,
} from '@mui/material';

const apiUrl = import.meta.env.VITE_API_URL;

const getEmbedUrl = (youtubeUrl) => {
  const match = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  const videoId = match?.[1];
  return videoId
    ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&controls=1&fs=0&showinfo=0`
    : youtubeUrl;
};

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
  const [volume, setVolume] = useState(0.7);
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);


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
        setVideoUrl(getEmbedUrl(lessonData.videoUrl));
        setVideoData({
          url: lessonData.videoUrl,
          title: lessonData.title,
          classPath: `/curso/${courseId}/modulo/${moduleId}/clase/${classId}`,
        });

        const allLessons = allLessonsData.Modules.flatMap((mod) =>
          mod.Lessons.map((lesson) => ({ ...lesson, moduleId: mod.id }))
        );

        const filtered = allLessons.filter((l) => l.id !== lessonData.id);
        setCourse(allLessonsData);
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

  // Reanudar video
  useEffect(() => {
    const stored = localStorage.getItem('resumeTime');
      if (stored) {
        const { path, time } = JSON.parse(stored);
        if (path === window.location.pathname && playerRef.current) {
          playerRef.current.seekTo(time, 'seconds');
        }
      }
  }, []);

  // Guardar tiempo al salir
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
  }, [classId]);

  useEffect(() => {
    previousClassIdRef.current = classId;
  }, [classId]);

  // Actualizar tiempo actual del video
  const handleProgress = (state) => {
    setCurrentTime(state.playedSeconds);
  };

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
            <Box sx={{ position: 'relative', width: '100%', height: '500px', mb: 2 }}>
              <ReactPlayer
                ref={playerRef}
                url={videoUrl}
                controls
                width="100%"
                height="100%"
                playing={isPlaying}
                volume={volume}
                onProgress={handleProgress}
                config={{
                  youtube: {
                    playerVars: {
                      rel: 0,
                      modestbranding: 1,
                      controls: 1,
                      fs: 0,
                      showinfo: 0,
                      disablekb: 1,
                    },
                  },
                  file: {
                    attributes: {
                      controlsList: 'nodownload',
                      onContextMenu: e => e.preventDefault(),
                    },
                  },
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 2,
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </Box>
          ) : (
            <Typography color="warning.main">
              El video no está disponible.
            </Typography>
          )}

          {/* 🎛 Controles personalizados */}
          <Stack spacing={2} direction="row" alignItems="center" sx={{ mb: 3 }}>
            <Button
              variant="contained"
              onClick={() => playerRef.current?.seekTo(currentTime - 10)}
            >
              ⏪ -10s
            </Button>
            <Button
              variant="contained"
              onClick={() => playerRef.current?.seekTo(currentTime + 10)}
            >
              ⏩ +10s
            </Button>
            <Button
              variant="contained"
              onClick={() => setIsPlaying((prev) => !prev)}
            >
              {isPlaying ? '⏸ Pausar' : '▶️ Reproducir'}
            </Button>
            <Typography>Volumen</Typography>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e, newVal) => {
                setVolume(newVal);
                playerRef.current?.setVolume(newVal);
              }}
              sx={{ width: 100 }}
            />
            <Typography variant="body2">
              {`⏱ ${Math.floor(currentTime)}s`}
            </Typography>
          </Stack>

          <LessonComments lessonId={lesson.id} />
        </Paper>
      </Box>

      {/* Columna derecha: clases relacionadas */}
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
