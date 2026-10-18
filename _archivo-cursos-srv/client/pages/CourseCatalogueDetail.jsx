import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  Box,
  Typography,
  Button,
  Grid,
  useMediaQuery,
} from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';

const apiUrl = import.meta.env.VITE_API_URL;

const CourseCatalogueDetail = () => {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState(null);
  const { authFetch } = useAuth();
  const { darkMode } = useTheme();
  const isMobile = useMediaQuery('(max-width:600px)');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState(null);
  const [enrollSuccess, setEnrollSuccess] = useState(null);
  const navigate = useNavigate();

  const handleFreeEnrollment = async () => {
    setIsEnrolling(true);
    setEnrollError(null);
    setEnrollSuccess(null);
    try {
      const res = await authFetch(`${apiUrl}/courses/${courseId}/enroll`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setEnrollError(data.message || 'Error al inscribirse');
      } else {
        setEnrollSuccess('Te inscribiste correctamente al curso');
        // Podés redirigir al curso real si querés:
        navigate(`/curso/${courseId}`);
      }
    } catch (err) {
      setEnrollError('Error al conectar con el servidor');
    } finally {
      setIsEnrolling(false);
    }
  };

  useEffect(() => {
    const fetchCursos = async () => {
      try {
        const res = await authFetch(`${apiUrl}/courses/catalogue/${courseId}`);
        if (res.status === 403) return setError('No tienes acceso a este curso.');
        if (!res.ok) {
          const data = await res.json();
          return setError(data?.message || 'Ocurrió un error al cargar el curso.');
        }
        const data = await res.json();
        setCourse(data);
      } catch {
        setError('Error al conectar con el servidor.');
      }
    };

    fetchCursos();
  }, []);

  if (error) {
    return (
      <Box mt={6} textAlign="center">
        <Typography variant="h6" color="error">{error}</Typography>
      </Box>
    );
  }

  if (!course) {
    return (
      <Box mt={6} textAlign="center">
        <Typography variant="h6">Cargando curso...</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        padding: isMobile ? '1.5rem' : '2.5rem 3rem',
        backgroundColor: darkMode ? '#121212' : '#f9f9f9',
        color: darkMode ? '#eee' : '#222',
        minHeight: '100vh',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      {/* HEADER */}
      <Box
        sx={{
          background: darkMode
            ? 'linear-gradient(90deg, #444, #222)'
            : 'linear-gradient(90deg, #007bff 0%, #00c6ff 100%)',
          color: darkMode ? '#ddd' : 'white',
          padding: '2.5rem 2rem',
          borderRadius: '16px',
          boxShadow: darkMode
            ? '0 6px 20px rgba(255, 255, 255, 0.07)'
            : '0 6px 20px rgba(0, 123, 255, 0.3)',
          textAlign: 'center',
          marginBottom: '2.5rem',
        }}
      >
        <img
          src={course.thumbnailUrl}
          alt={course.title}
          style={{
            maxWidth: '200px',
            height: 'auto',
            marginBottom: '1rem',
            borderRadius: '12px',
          }}
        />
        <Typography variant="h3" fontWeight="700" mb={1}>
          {course.title}
        </Typography>
        <Typography variant="body1" fontSize="1.2rem" opacity={0.9}>
          {course.description}
        </Typography>
        <Button
          variant="contained"
          onClick={parseFloat(course.price) === 0 ? handleFreeEnrollment : null}
          disabled={parseFloat(course.price) !== 0 || isEnrolling}
          startIcon={<ShoppingCartIcon />}
          sx={{
            mt: 3,
            backgroundColor: darkMode ? '#66b2ff' : '#007bff',
            color: '#fff',
            '&:hover': {
              backgroundColor: darkMode ? '#4da8ff' : '#0056b3',
            },
          }}
        >
          {parseFloat(course.price) === 0
            ? isEnrolling
              ? 'Inscribiéndote...'
              : 'Empezar curso'
            : `Comprar curso - $${course.price}`}
        </Button>
        {enrollError && (
          <Typography color="error" mt={2}>
            {enrollError}
          </Typography>
        )}

        {enrollSuccess && (
          <Typography color="primary" mt={2}>
            {enrollSuccess}
          </Typography>
        )}

      </Box>

      {/* CONTENIDO */}
      <Box>
        <Typography
          variant="h5"
          mb={3}
          fontWeight="600"
          sx={{
            borderBottom: `2px solid ${darkMode ? '#66b2ff' : '#007bff'}`,
            display: 'inline-block',
            paddingBottom: '0.5rem',
            color: darkMode ? '#66b2ff' : '#007bff',
          }}
        >
          Contenido del curso
        </Typography>

        {course.Modules && course.Modules.length > 0 ? (
          course.Modules.map((mod) => (
            <Box
              key={mod.id}
              sx={{
                backgroundColor: darkMode ? '#222831' : '#e9f4ff',
                boxShadow: darkMode
                  ? '0 2px 10px rgba(102, 178, 255, 0.15)'
                  : '0 2px 10px rgba(0, 123, 255, 0.1)',
                padding: '1rem 1.5rem',
                borderRadius: '14px',
                marginBottom: '2rem',
              }}
            >
              <Typography
                variant="h6"
                fontWeight="700"
                mb={2}
                sx={{
                  color: darkMode ? '#66b2ff' : '#0056b3',
                }}
              >
                {mod.title}
              </Typography>

              <Grid container spacing={3}>
                {mod.Lessons && mod.Lessons.length > 0 ? (
                  mod.Lessons.map((lesson) => (
                    <Grid item xs={12} sm={6} md={4} key={lesson.id}>
                      <Box
                        sx={{
                          backgroundColor: darkMode ? '#1e1e1e' : '#fff',
                          color: darkMode ? '#eee' : '#222',
                          padding: '1.2rem 1.5rem',
                          borderRadius: '14px',
                          boxShadow: darkMode
                            ? '0 3px 15px rgba(102, 178, 255, 0.15)'
                            : '0 3px 15px rgba(0, 0, 0, 0.07)',
                          cursor: 'default',
                          transition: '0.3s',
                          '&:hover': {
                            transform: 'translateY(-5px) scale(1.02)',
                            boxShadow: darkMode
                              ? '0 10px 30px rgba(102, 178, 255, 0.35)'
                              : '0 10px 30px rgba(0, 123, 255, 0.25)',
                          },
                        }}
                      >
                        <Typography variant="subtitle1" fontWeight="600" gutterBottom>
                          {lesson.title}
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                          {lesson.description || 'Sin descripción'}
                        </Typography>
                      </Box>
                    </Grid>
                  ))
                ) : (
                  <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
                    Este módulo no tiene clases aún.
                  </Typography>
                )}
              </Grid>
            </Box>
          ))
        ) : (
          <Typography variant="body1">Este curso no tiene módulos.</Typography>
        )}
      </Box>
    </Box>
  );
};

export default CourseCatalogueDetail;


