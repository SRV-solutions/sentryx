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
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [lessonDuration, setLessonDuration] = useState(0);
  const [initialVideoTime, setInitialVideoTime] = useState(0);
  const [hasSeeked, setHasSeeked] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [lessonRes, allLessonsRes] = await Promise.all([
          authFetch(`${apiUrl}/courses/me/${courseId}/module/${moduleId}/lessons/${classId}`),
          authFetch(`${apiUrl}/courses/me/${courseId}`),
        ]);

        if (!lessonRes.ok || !allLessonsRes.ok) throw new Error('Error al obtener datos');

        const lessonData = await lessonRes.json();
        const allLessonsData = await allLessonsRes.json();

        if (
          lessonData.UserLessonProgresses &&
          lessonData.UserLessonProgresses.length > 0
        ) {
          const duration = lessonData.UserLessonProgresses[0].watchedDuration;
          setInitialVideoTime(duration || 0);
        }

        setLesson(lessonData);
        setVideoUrl(getEmbedUrl(lessonData.youtubeUrl || lessonData.videoUrl));
        setVideoData({
          url: lessonData.videoUrl,
          title: lessonData.title,
          classPath: `/curso/${courseId}/modulo/${moduleId}/clase/${classId}`,
          ...lessonData
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

  // Hacer seek al tiempo guardado cuando el player esté listo y no se haya hecho ya
  useEffect(() => {
    if (playerReady && initialVideoTime > 0 && !hasSeeked) {
      const internalPlayer = playerRef.current.getInternalPlayer();
      if (internalPlayer && typeof internalPlayer.seekTo === 'function') {
        internalPlayer.seekTo(initialVideoTime);
        setHasSeeked(true);
        setIsPlaying(true);
      }
    }
  }, [playerReady, initialVideoTime, hasSeeked]);

  const handleFullscreen = () => {
    const elem = playerContainerRef.current;
    if (!elem) return;

    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  };

  const saveProgressToBackend = async (time, completed = false) => {
    try {
      const response = await authFetch(
        `${apiUrl}/lessons/${classId}/progress`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchedDuration: time, completed }),
        }
      );
      if (!response.ok) throw new Error('Error guardando progreso');
    } catch (err) {
      console.error(err);
    }
  };

  const handlePauseOrUnload = () => {
    saveProgressToBackend(currentTime);
  };

  useEffect(() => {
    if (!isPlaying) {
      handlePauseOrUnload();
    }
  }, [isPlaying]);

  useEffect(() => {
    window.addEventListener('beforeunload', handlePauseOrUnload);
    return () => window.removeEventListener('beforeunload', handlePauseOrUnload);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      saveProgressToBackend(currentTime);
    }, 10000);

    return () => clearInterval(interval);
  }, [isPlaying, currentTime]);

  const handleDuration = (duration) => {
    setLessonDuration(duration);
  };

  const handleEnded = () => {
    saveProgressToBackend(lessonDuration, true);
    setIsPlaying(false);
  };

  const previousClassIdRef = useRef(classId);

  useEffect(() => {
    previousClassIdRef.current = classId;
  }, [classId]);

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

          {videoUrl ? (
            <Box
              ref={playerContainerRef}
              sx={{ position: 'relative', width: '100%', height: '500px', mb: 2 }}
            >
              <ReactPlayer
                ref={playerRef}
                url={videoUrl}
                controls
                width="100%"
                height="100%"
                playing={isPlaying}
                volume={volume}
                onReady={() => setPlayerReady(true)}
                onDuration={handleDuration}
                onEnded={handleEnded}
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
            <Button
              variant="contained"
              onClick={handleFullscreen}
            >
              ⛶ Pantalla completa
            </Button>
            <Typography>Volumen</Typography>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e, newVal) => {
                setVolume(newVal);
              }}
              sx={{ width: 100 }}
            />
            <Typography variant="body2">
              {`⏱ ${Math.floor(currentTime)}s`}
            </Typography>
          </Stack>
          {lesson.description && (
            <>
              <Typography
                variant="h4"
                sx={{ mb: 1, color: darkMode ? '#bbb' : '#555', lineHeight: 1.6 }}
              >
                Descripción
              </Typography>
              <Typography
                sx={{ mb: 2, color: darkMode ? '#bbb' : '#555', lineHeight: 1.6 }}
              >
                {lesson.description}
              </Typography>
            </>
          )}
          <LessonComments lessonId={lesson.id} />
        </Paper>
      </Box>

      {/* Columna derecha: clases relacionadas */}
      <Box sx={{ flex: 1, minWidth: '300px' }}>
        <Typography variant="h6" gutterBottom>
          Más clases del curso
        </Typography>
        <Divider sx={{ mb: 2 }} />
        {relatedLessons.map((l) => {
          const progress = l?.UserLessonProgresses?.[0];
          const isCompleted = progress?.completed;
          const watchedDuration = progress?.watchedDuration || 0;
          const hasProgress = watchedDuration > 0;

          return (
            <Paper
              key={l.id}
              sx={{
                p: 1,
                mb: 2,
                backgroundColor: isCompleted
                  ? (darkMode ? '#1e1e1e' : '#d9f5d4') // Fondo verdoso si ya lo viste
                  : hasProgress
                    ? (darkMode ? '#2a2a2a' : '#f0f0f0')
                    : (darkMode ? '#2a2a2a' : '#fafafa'),
                borderLeft: isCompleted
                  ? '5px solid #4caf50'
                  : hasProgress
                    ? '5px solid #ff9800'
                    : '5px solid transparent',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                position: 'relative',
                '&:hover': {
                  boxShadow: darkMode
                    ? '0 0 10px rgba(255,255,255,0.1)'
                    : '0 0 10px rgba(0,0,0,0.1)',
                },
              }}
            >
              <Link
                to={`/curso/${courseId}/modulo/${l.moduleId}/clase/${l.id}`}
                style={{
                  textDecoration: 'none',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flex: 1,
                }}
              >
                <Box sx={{ position: 'relative' }}>
                  <img
                    src={course?.thumbnailUrl || 'https://via.placeholder.com/120x70?text=Sin+imagen'}
                    alt={l.title}
                    style={{ width: 120, height: 70, borderRadius: 8, objectFit: 'cover' }}
                  />
                  {isCompleted && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 5,
                        left: 5,
                        backgroundColor: '#4caf50',
                        color: '#fff',
                        borderRadius: 1,
                        px: 1,
                        fontSize: '0.75rem',
                      }}
                    >
                      Clase Vista
                    </Box>
                  )}
                  {hasProgress && !isCompleted && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        width: '100%',
                        height: 5,
                        backgroundColor: '#ccc',
                      }}
                    >
                      <Box
                        sx={{
                          width: `${Math.min((watchedDuration / 120) * 100, 100)}%`,
                          height: '100%',
                          backgroundColor: '#ff9800',
                        }}
                      />
                    </Box>
                  )}
                </Box>
                <Box>
                  <Typography variant="body1" sx={{ color: darkMode ? '#fff' : '#000' }}>
                    {l.title}
                  </Typography>
                  {hasProgress && !isCompleted && (
                    <Typography variant="caption" sx={{ color: '#ff9800' }}>
                      Continuar viendo ({Math.round(watchedDuration)}s vistos)
                    </Typography>
                  )}
                </Box>
              </Link>
            </Paper>
          );
        })}

      </Box>
    </Box>
  );
};

export default ClassDetail;
