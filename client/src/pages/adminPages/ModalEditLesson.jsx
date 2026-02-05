import { Modal, Box, Typography, TextField, Button } from '@mui/material';
import { useTheme } from '../../context/ThemeContext';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const apiUrl = import.meta.env.VITE_API_URL;

function ModalEditLesson({
  openModalLesson,
  handleCloseModalLesson,
  lessonData,
  setLessonData,
  handleSaveLesson,
  savingLesson,
}) {
  const { darkMode } = useTheme();
  const { authFetch } = useAuth(); // ✅ usamos authFetch
  const [uploading, setUploading] = useState(false);

  const styleModal = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 400,
    bgcolor: darkMode ? '#333' : '#fff',
    border: '2px solid #000',
    boxShadow: 24,
    p: 4,
    color: darkMode ? '#fff' : '#000',
  };

  const handleUploadVideo = async () => {
    if (!lessonData.videoFile) {
      alert('Primero selecciona un archivo de video');
      return;
    }

    const formData = new FormData();
    formData.append('video', lessonData.videoFile);

    try {
      setUploading(true);
      const res = await authFetch(`${apiUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || 'Error subiendo el video');
        return;
      }

      const data = await res.json();

      setLessonData({ ...lessonData, videoUrl: data.url });
      alert('Video subido con éxito 🚀');
    } catch (err) {
      console.error(err);
      alert('Error al subir el video');
    } finally {
      setUploading(false);
    }
  };

  return (
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
          type="file"
          inputProps={{ accept: 'video/*' }}
          onChange={(e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('video/')) {
              setLessonData({ ...lessonData, videoFile: file });
            } else {
              alert('Solo se permiten archivos de video');
              e.target.value = null;
            }
          }}
          fullWidth
          margin="normal"
          InputProps={{ style: { color: darkMode ? '#fff' : '#000' } }}
          InputLabelProps={{ style: { color: darkMode ? '#aaa' : '#000' } }}
        />

        {lessonData.videoUrl && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            ✅ Video subido: <a href={lessonData.videoUrl} target="_blank" rel="noreferrer">Ver en S3</a>
          </Typography>
        )}

        <Box mt={2} display="flex" justifyContent="space-between" gap={2}>
          <Button
            variant="outlined"
            onClick={handleUploadVideo}
            disabled={uploading || !lessonData.videoFile}
          >
            {uploading ? 'Subiendo...' : 'Subir Video'}
          </Button>

          <Box display="flex" gap={2}>
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
      </Box>
    </Modal>
  );
}

export default ModalEditLesson;
