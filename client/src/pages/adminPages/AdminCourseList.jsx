// src/pages/adminPages/AdminCourseList.jsx
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import styles from '../MyCourseDetail.module.css'; // reutilizamos estilos
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { TextField, InputAdornment } from '@mui/material';
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
