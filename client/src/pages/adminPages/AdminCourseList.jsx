// src/pages/adminPages/AdminCourseList.jsx
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import styles from '../MyCourseDetail.module.css'; // reutilizamos estilos
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { TextField, InputAdornment, Button, Modal, Box, Typography, } from '@mui/material';


import SearchIcon from '@mui/icons-material/Search';

const apiUrl = import.meta.env.VITE_API_URL;

const AdminCourseList = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState([]);
  const [error, setError] = useState(null);
  const { darkMode } = useTheme();
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    thumbnailUrl: ''
  });
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch(`${apiUrl}/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.message || 'Error al crear el curso');
        return;
      }

      const newCourse = await res.json();
      setCourses(prev => [...prev, newCourse]);
      setFiltered(prev => [...prev, newCourse]);
      setFormData({ title: '', description: '', thumbnailUrl: '' });
      handleClose();
    } catch (err) {
      alert('Error de red al crear el curso');
    }
  };

  useEffect(() => {
    const fetchCursos = async () => {
      try {
        const res = await authFetch(`${apiUrl}/courses`);
        if (!res.ok) {
          const data = await res.json();
          setError(data?.message || 'Error al cargar los cursos.');
          return;
        }
        const data = await res.json();
        setCourses(data);
        setFiltered(data);
      } catch (error) {
        setError('Error de conexión con el servidor.');
      }
    };

    fetchCursos();
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(courses.filter(c => c.title.toLowerCase().includes(q)));
  }, [search, courses]);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!courses.length) return <p className={styles.loading}>Cargando cursos...</p>;

  return (
    <div className={`${styles.container} ${darkMode ? styles.darkContainer : ''}`}>
      <h1>Administrar Cursos</h1>
      <br />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <Button variant="contained" color="primary" onClick={handleOpen}>
          Crear nuevo curso
        </Button>
      </div>

      <Modal open={open} onClose={handleClose}>
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 400,
          bgcolor: darkMode ? '#333' : 'background.paper',
          boxShadow: 24,
          p: 4,
          borderRadius: 2,
        }}>
          <Typography variant="h6" gutterBottom>
            Nuevo Curso
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              name="title"
              label="Título"
              value={formData.title}
              onChange={handleChange}
              fullWidth
              required
              margin="normal"
            />
            <TextField
              name="description"
              label="Descripción"
              value={formData.description}
              onChange={handleChange}
              fullWidth
              required
              margin="normal"
            />
            <TextField
              name="thumbnailUrl"
              label="URL de la miniatura"
              value={formData.thumbnailUrl}
              onChange={handleChange}
              fullWidth
              margin="normal"
            />
            <Button type="submit" variant="contained" color="success" fullWidth sx={{ mt: 2 }}>
              Crear
            </Button>
          </form>
        </Box>
      </Modal>

      <TextField
        label="Buscar curso"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: darkMode ? '#ccc' : '#555' }} />
            </InputAdornment>
          ),
          style: { color: darkMode ? '#fff' : '#000' },
        }}
        InputLabelProps={{
          style: { color: darkMode ? '#aaa' : '#333' },
        }}
      />

      <div className={styles.cards}>
        {filtered.map((course) => (
          <div
            key={course.id}
            className={`${styles.card} ${darkMode ? styles.darkCard : ''}`}
            onClick={() => navigate(`/admin/cursos/${course.id}`)}
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCourseList;
