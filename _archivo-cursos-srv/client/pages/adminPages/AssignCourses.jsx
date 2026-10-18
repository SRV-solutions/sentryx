import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  FormControlLabel,
  Typography,
  Snackbar,
  Alert,
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';

const apiUrl = import.meta.env.VITE_API_URL;

const AssignCourses = () => {
  const { authFetch } = useAuth();
  const { userId } = useParams(); // id del usuario desde la URL
  const navigate = useNavigate();

  const [availableCourses, setAvailableCourses] = useState([]);
  const [assignedCourses, setAssignedCourses] = useState(new Set()); // cursos asignados (id)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Snackbar
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  // Cargar cursos disponibles y asignados
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);
        // Traigo todos los cursos disponibles
        const resCourses = await authFetch(`${apiUrl}/courses`);
        const dataCourses = resCourses.ok ? await resCourses.json() : [];
        
        // Traigo cursos asignados al usuario
        const resAssigned = await authFetch(`${apiUrl}/users/${userId}/courses`);
        const dataAssigned = resAssigned.ok ? await resAssigned.json() : [];
        
        setAvailableCourses(dataCourses);
        setAssignedCourses(new Set(dataAssigned.map((c) => c.Course.id))); // Set de ids asignados
      } catch (error) {
        setSnackbarSeverity('error');
        setSnackbarMsg('Error cargando los cursos');
        setSnackbarOpen(true);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [authFetch, apiUrl, userId]);

  const toggleCourse = (courseId) => {
    setAssignedCourses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(courseId)) newSet.delete(courseId);
      else newSet.add(courseId);
      return newSet;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Enviar la lista de ids de cursos asignados al backend
      const res = await authFetch(`${apiUrl}/users/${userId}/courses`, {
        method: 'PUT', // o POST, según cómo manejes el backend
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds: Array.from(assignedCourses) }),
      });

      if (res.ok) {
        setSnackbarSeverity('success');
        setSnackbarMsg('Cursos asignados con éxito');
      } else {
        setSnackbarSeverity('error');
        setSnackbarMsg('Error al asignar cursos');
      }
    } catch {
      setSnackbarSeverity('error');
      setSnackbarMsg('Error al asignar cursos');
    } finally {
      setSnackbarOpen(true);
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Asignar Cursos al Usuario {userId}
      </Typography>

      {loading ? (
        <Box display="flex" justifyContent="center" mt={4}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
            {availableCourses.length === 0 && <Typography>No hay cursos disponibles.</Typography>}
            {availableCourses.map((course) => (
              <FormControlLabel
                key={course.id}
                control={
                  <Checkbox
                    checked={assignedCourses.has(course.id)}
                    onChange={() => toggleCourse(course.id)}
                  />
                }
                label={course.title}
              />
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <CircularProgress size={24} color="inherit" /> : 'Guardar Cambios'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/admin/usuarios')}
              disabled={saving}
            >
              Cancelar
            </Button>
          </Box>
        </>
      )}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default AssignCourses;
