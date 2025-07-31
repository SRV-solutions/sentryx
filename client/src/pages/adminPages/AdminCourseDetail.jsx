import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import styles from '../CourseDetail.module.css'
import {
  Box,
  Modal,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Paper,
  Grid,
  Divider,
  Stack,
} from '@mui/material';
import DescriptionPreview from '../../components/DescriptionPreview';

const apiUrl = import.meta.env.VITE_API_URL;

const CourseDetail = () => {
  const { courseId } = useParams();
  const { darkMode } = useTheme();
  const { authFetch } = useAuth();

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal state para clases
  const [openModalLesson, setOpenModalLesson] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [lessonData, setLessonData] = useState({
    title: '',
    description: '',
    youtubeUrl: '',
  });
  const [savingLesson, setSavingLesson] = useState(false);

  // Modal state para curso
  const [openModalCourse, setOpenModalCourse] = useState(false);
  const [courseData, setCourseData] = useState({
    title: '',
    description: '',
    thumbnailUrl: '',
    price: 0
  });
  const [savingCourse, setSavingCourse] = useState(false);
  const [openModalModule, setOpenModalModule] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [moduleData, setModuleData] = useState({
    title: '',
    order: 1,
  });
  const [openNewLessonModal, setOpenNewLessonModal] = useState(false);
  const [newLessonData, setNewLessonData] = useState({
    title: '',
    description: '',
    youtubeUrl: '',
    order: 1,
  });
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [savingNewLesson, setSavingNewLesson] = useState(false);
  const [editingModule, setEditingModule] = useState(null); // Módulo que se edita

  const handleOpenNewLessonModal = (moduleId) => {
    setSelectedModuleId(moduleId);
    setNewLessonData({
      title: '',
      description: '',
      youtubeUrl: '',
      order: 1,
    });
    setOpenNewLessonModal(true);
  };

  const handleCloseNewLessonModal = () => {
    setOpenNewLessonModal(false);
    setSelectedModuleId(null);
  };

  const handleSaveNewLesson = async () => {
    if (!selectedModuleId) return;

    setSavingNewLesson(true);
    try {
      const res = await authFetch(`${apiUrl}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newLessonData,
          moduleId: selectedModuleId,
        }),
      });

      if (!res.ok) {
        alert('Error al crear la clase');
        setSavingNewLesson(false);
        return;
      }

      const newLesson = await res.json();

      setCourse((prev) => {
        const updatedModules = prev.Modules.map((mod) => {
          if (mod.id === selectedModuleId) {
            return {
              ...mod,
              Lessons: [...(mod.Lessons || []), newLesson],
            };
          }
          return mod;
        });
        return { ...prev, Modules: updatedModules };
      });

      handleCloseNewLessonModal();
    } catch (error) {
      alert('Error de red al crear la clase');
    } finally {
      setSavingNewLesson(false);
    }
  };

  const styleModal = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: { xs: '90%', sm: 500 },
    bgcolor: darkMode ? '#121212' : 'background.paper',
    color: darkMode ? '#eee' : 'text.primary',
    borderRadius: 2,
    boxShadow: 24,
    p: 4,
    outline: 'none',
  };

  const handleCloseModalModule = () => {
    setOpenModalModule(false);
    setModuleData({ title: '', order: 1 });
    setEditingModule(null);
  };


  const handleEditModule = (module) => {
    setEditingModule(module);
    setModuleData({ title: module.title, order: module.order });
    setOpenModalModule(true);
  };

  const handleSaveModule = async () => {
    if (!moduleData.title || !moduleData.order) return;
    setSavingModule(true);
    try {
      const url = editingModule
        ? `${apiUrl}/modules/${editingModule.id}`
        : `${apiUrl}/modules`;
      const method = editingModule ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...moduleData,
          ...(editingModule ? {} : { courseId: Number(courseId) }),
        }),
      });

      if (!res.ok) {
        alert(editingModule ? 'Error al editar el módulo' : 'Error al crear el módulo');
        setSavingModule(false);
        return;
      }

      const updatedModule = await res.json();

      setCourse((prev) => {
        const updatedModules = editingModule
          ? prev.Modules.map((mod) =>
            mod.id === editingModule.id ? { ...mod, ...updatedModule } : mod
          )
          : [...(prev.Modules || []), { ...updatedModule, Lessons: [] }];

        return { ...prev, Modules: updatedModules };
      });

      handleCloseModalModule();
    } catch (error) {
      alert(editingModule ? 'Error de red al editar el módulo' : 'Error de red al crear el módulo');
    } finally {
      setSavingModule(false);
    }
  };


  useEffect(() => {
    const fetchCurso = async () => {
      setLoading(true);
      try {
        const userData = localStorage.getItem('user');
        const parsedUser = JSON.parse(userData);

        const res = await authFetch(`${apiUrl}/courses/${courseId}`, {
          headers: {
            Authorization: `Bearer ${parsedUser.token}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.status === 403) {
          setCourse({ error: 'No tienes acceso a este curso.' });
          setLoading(false);
          return;
        }

        if (!res.ok) {
          setCourse({ error: 'Ocurrió un error al cargar el curso.' });
          setLoading(false);
          return;
        }

        const data = await res.json();
        setCourse(data);
        setCourseData({ title: data.title, description: data.description, thumbnailUrl: data.thumbnailUrl, price: data.price });
      } catch (error) {
        setCourse({ error: 'Error al conectar con el servidor.' });
      } finally {
        setLoading(false);
      }
    };

    fetchCurso();
  }, [courseId, authFetch]);

  // Funciones modal clase
  const handleOpenModalLesson = (lesson) => {
    setSelectedLesson(lesson);
    setLessonData({
      title: lesson.title,
      description: lesson.description,
      youtubeUrl: lesson.youtubeUrl,
    });
    setOpenModalLesson(true);
  };

  const handleCloseModalLesson = () => {
    setOpenModalLesson(false);
    setSelectedLesson(null);
  };

  const handleSaveLesson = async () => {
    if (!selectedLesson) return;
    setSavingLesson(true);
    try {
      const res = await authFetch(`${apiUrl}/lessons/${selectedLesson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lessonData),
      });

      if (!res.ok) {
        alert('Error al guardar la clase');
        setSavingLesson(false);
        return;
      }

      setCourse((prev) => {
        const newModules = prev.Modules.map((mod) => {
          if (!mod.Lessons) return mod;
          return {
            ...mod,
            Lessons: mod.Lessons.map((l) =>
              l.id === selectedLesson.id ? { ...l, ...lessonData } : l
            ),
          };
        });
        return { ...prev, Modules: newModules };
      });

      alert('Clase guardada con éxito');
      handleCloseModalLesson();
    } catch (error) {
      alert('Error al guardar la clase');
    } finally {
      setSavingLesson(false);
    }
  };

  // Funciones modal curso
  const handleOpenModalCourse = () => {
    setCourseData({ title: course.title, description: course.description, thumbnailUrl: course.thumbnailUrl, price: course.price });
    setOpenModalCourse(true);
  };

  const handleCloseModalCourse = () => {
    setOpenModalCourse(false);
  };

  const handleSaveCourse = async () => {
    setSavingCourse(true);
    try {
      const res = await authFetch(`${apiUrl}/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(courseData),
      });

      if (!res.ok) {
        alert('Error al guardar el curso');
        setSavingCourse(false);
        return;
      }

      setCourse((prev) => ({
        ...prev,
        title: courseData.title,
        description: courseData.description,
      }));

      alert('Curso guardado con éxito');
      handleCloseModalCourse();
    } catch (error) {
      alert('Error al guardar el curso');
    } finally {
      setSavingCourse(false);
    }
  };

  if (loading)
    return (
      <Box display="flex" justifyContent="center" mt={5}>
        <CircularProgress color={darkMode ? 'inherit' : 'primary'} />
      </Box>
    );

  if (!course)
    return (
      <Typography
        variant="body1"
        align="center"
        mt={5}
        color={darkMode ? 'grey.400' : 'text.primary'}
      >
        Cargando curso...
      </Typography>
    );

  if (course.error)
    return (
      <Typography
        variant="body1"
        color="error"
        align="center"
        mt={5}
        sx={{ color: darkMode ? '#f44336' : 'error.main' }}
      >
        {course.error}
      </Typography>
    );

  return (
    <Box
      sx={{
        p: 3,
        bgcolor: darkMode ? '#121212' : 'background.default',
        minHeight: '100vh',
      }}
    >
      <Modal
        open={openModalModule}
        onClose={handleCloseModalModule}
        aria-labelledby="modal-module-title"
        aria-describedby="modal-module-description"
      >
        <Box sx={styleModal}>
          <Typography id="modal-module-title" variant="h6" component="h2" gutterBottom>
            Crear Módulo
          </Typography>
          <TextField
            label="Título"
            value={moduleData.title}
            onChange={(e) => setModuleData({ ...moduleData, title: e.target.value })}
            fullWidth
            margin="normal"
            InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
            InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
          />
          <TextField
            label="Orden"
            type="number"
            value={moduleData.order}
            onChange={(e) => setModuleData({ ...moduleData, order: Number(e.target.value) })}
            fullWidth
            margin="normal"
            InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
            InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
          />

          <Box mt={2} display="flex" justifyContent="flex-end" gap={2}>
            <Button variant="outlined" onClick={handleCloseModalModule} disabled={savingModule}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveModule}
              disabled={savingModule}
              color="success"
            >
              {savingModule ? 'Guardando...' : 'Guardar'}
            </Button>
          </Box>
        </Box>
      </Modal>

      {/* Título y descripción del curso con botón para editar */}
      <Box mb={4} textAlign="center" position="relative">
        <Typography
          variant="h3"
          gutterBottom
          sx={{ color: darkMode ? '#eee' : 'text.primary' }}
        >
          {course.title}
        </Typography>
        <Typography
          variant="subtitle1"
          sx={{ color: darkMode ? '#aaa' : 'text.secondary' }}
        >
          {course.description}
        </Typography>

        <Button
          variant="outlined"
          size="small"
          onClick={handleOpenModalCourse}
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            color: darkMode ? '#eee' : 'primary.main',
            borderColor: darkMode ? '#eee' : 'primary.main',
            '&:hover': {
              backgroundColor: darkMode ? '#333' : 'primary.light',
              borderColor: darkMode ? '#eee' : 'primary.dark',
            },
          }}
        >
          Editar Curso
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={() => setOpenModalModule(true)}
        >
          Crear Módulo
        </Button>

      </Box>

      {/* Listado de módulos y clases */}
      {course.Modules && course.Modules.length > 0 ? (
        course.Modules.map((module) => (
          <Box key={module.id} mb={5}>
            <Modal
              open={openNewLessonModal}
              onClose={handleCloseNewLessonModal}
              aria-labelledby="modal-new-lesson-title"
              aria-describedby="modal-new-lesson-description"
            >
              <Box sx={styleModal}>
                <Typography id="modal-module-title" variant="h6" component="h2" gutterBottom>
                  {editingModule ? 'Editar Módulo' : 'Crear Módulo'}
                </Typography>

                <TextField
                  label="Título"
                  value={newLessonData.title}
                  onChange={(e) => setNewLessonData({ ...newLessonData, title: e.target.value })}
                  fullWidth
                  margin="normal"
                  InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
                  InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
                />
                <TextField
                  label="Descripción"
                  value={newLessonData.description}
                  onChange={(e) => setNewLessonData({ ...newLessonData, description: e.target.value })}
                  fullWidth
                  multiline
                  rows={4}
                  margin="normal"
                  InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
                  InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
                />
                <TextField
                  label="YouTube URL"
                  value={newLessonData.youtubeUrl}
                  onChange={(e) => setNewLessonData({ ...newLessonData, youtubeUrl: e.target.value })}
                  fullWidth
                  margin="normal"
                  InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
                  InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
                />
                <TextField
                  label="Orden"
                  type="number"
                  value={newLessonData.order}
                  onChange={(e) => setNewLessonData({ ...newLessonData, order: Number(e.target.value) })}
                  fullWidth
                  margin="normal"
                  InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
                  InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
                />

                <Box mt={2} display="flex" justifyContent="flex-end" gap={2}>
                  <Button variant="outlined" onClick={handleCloseNewLessonModal} disabled={savingNewLesson}>
                    Cancelar
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSaveNewLesson}
                    disabled={savingNewLesson}
                    color="primary"
                  >
                    {savingNewLesson ? 'Guardando...' : 'Guardar'}
                  </Button>
                </Box>
              </Box>
            </Modal>

            <Typography
              variant="h5"
              mb={2}
              sx={{ color: darkMode ? '#ddd' : 'text.primary' }}
            >
              {module.title}
            </Typography>
            <Divider sx={{ mb: 2, borderColor: darkMode ? '#444' : undefined }} />
            <Grid container spacing={2}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleOpenNewLessonModal(module.id)}
                sx={{ mb: 2 }}
              >
                Agregar clase a este módulo
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleEditModule(module)}
                sx={{ mb: 2, ml: 2 }}
                color="warning"
              >
                Editar módulo
              </Button>

              {module.Lessons && module.Lessons.length > 0 ? (
                module.Lessons.map((lesson) => (
                  <Grid item xs={12} sm={6} md={4} key={lesson.id}>

                    <Paper
                      elevation={3}
                      className={`${styles.card} ${darkMode ? styles.darkCard : ''}`}
                      sx={{
                        backgroundColor: 'transparent', // le decís a MUI: "no me pongas blanco por defecto"
                      }}
                      onClick={() => handleOpenModalLesson(lesson)}
                    >



                      <Typography variant="h6" gutterBottom>
                        {lesson.title}
                      </Typography>
                      <Typography variant="body2" noWrap sx={{ opacity: 0.8 }}>
                        <DescriptionPreview text={lesson.description} showExpanded={false} />
                      </Typography>

                    </Paper>
                  </Grid>
                ))
              ) : (
                <Typography sx={{ ml: 2 }} color={darkMode ? '#aaa' : 'text.secondary'}>
                  No hay clases en este módulo.
                </Typography>
              )}
            </Grid>
          </Box>
        ))
      ) : (
        <Typography sx={{ color: darkMode ? '#aaa' : 'text.secondary' }}>
          No hay módulos en este curso.
        </Typography>
      )}

      {/* Modal para editar clase */}
      <Modal
        open={openModalLesson}
        onClose={handleCloseModalLesson}
        aria-labelledby="modal-lesson-title"
        aria-describedby="modal-lesson-description"
      >
        <Box sx={styleModal}>
          <Typography id="modal-lesson-title" variant="h6" component="h2" gutterBottom>
            Editar Clase
          </Typography>
          <TextField
            label="Título"
            value={lessonData.title}
            onChange={(e) => setLessonData({ ...lessonData, title: e.target.value })}
            fullWidth
            margin="normal"
            InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
            InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
          />
          <TextField
            label="Descripción"
            value={lessonData.description}
            onChange={(e) => setLessonData({ ...lessonData, description: e.target.value })}
            fullWidth
            multiline
            rows={4}
            margin="normal"
            InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
            InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
          />
          <TextField
            label="YouTube URL"
            value={lessonData.youtubeUrl}
            onChange={(e) => setLessonData({ ...lessonData, youtubeUrl: e.target.value })}
            fullWidth
            margin="normal"
            InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
            InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
          />

          <Box mt={2} display="flex" justifyContent="flex-end" gap={2}>
            <Button variant="outlined" onClick={handleCloseModalLesson} disabled={savingLesson}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveLesson}
              disabled={savingLesson}
              color="primary"
            >
              {savingLesson ? 'Guardando...' : 'Guardar'}
            </Button>
          </Box>
        </Box>
      </Modal>

      {/* Modal para editar curso */}
      <Modal
        open={openModalCourse}
        onClose={handleCloseModalCourse}
        aria-labelledby="modal-course-title"
        aria-describedby="modal-course-description"
      >
        <Box sx={styleModal}>
          <Typography id="modal-course-title" variant="h6" component="h2" gutterBottom>
            Editar Curso
          </Typography>
          <TextField
            label="Título"
            value={courseData.title}
            onChange={(e) => setCourseData({ ...courseData, title: e.target.value })}
            fullWidth
            margin="normal"
            InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
            InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
          />
          <TextField
            label="Descripción"
            value={courseData.description}
            onChange={(e) => setCourseData({ ...courseData, description: e.target.value })}
            fullWidth
            multiline
            rows={4}
            margin="normal"
            InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
            InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
          />

          <TextField
            label="Thumbnail URL"
            value={courseData.thumbnailUrl}
            onChange={(e) => setCourseData({ ...courseData, thumbnailUrl: e.target.value })}
            fullWidth
            margin="normal"
            InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
            InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
          />
          <TextField
            label="Precio del curso"
            value={courseData.price}
            onChange={(e) => setCourseData({ ...courseData, price: e.target.value })}
            fullWidth
            margin="normal"
            InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
            InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
          />

          <Box mt={2} display="flex" justifyContent="flex-end" gap={2}>
            <Button variant="outlined" onClick={handleCloseModalCourse} disabled={savingCourse}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveCourse}
              disabled={savingCourse}
              color="primary"
            >
              {savingCourse ? 'Guardando...' : 'Guardar'}
            </Button>
          </Box>
        </Box>
      </Modal>
    </Box>
  );
};

export default CourseDetail;
