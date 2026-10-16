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

    if (!lessonData.id) {
      alert('Guardá la clase antes de subir el video');
      return;
    }

    try {
      setUploading(true);
      // 1) Pedimos una URL firmada; 2) el navegador sube directo a S3; 3) confirmamos.
      // El video nunca pasa por el servidor (antes lo cargaba entero en memoria).
      const presign = await authFetch(`${apiUrl}/lessons/${lessonData.id}/video/presign`, {
        method: 'POST',
        body: JSON.stringify({ fileName: lessonData.videoFile.name, contentType: lessonData.videoFile.type }),
      });
      if (!presign?.ok) {
        const errorData = await presign?.json().catch(() => ({}));
        alert(errorData?.error || 'Error preparando la subida');
        return;
      }
      const { key, uploadUrl } = await presign.json();
      const put = await fetch(uploadUrl, { method: 'PUT', body: lessonData.videoFile, headers: { 'Content-Type': lessonData.videoFile.type } });
      if (!put.ok) {
        alert('Error subiendo el video a S3');
        return;
      }
      const confirm = await authFetch(`${apiUrl}/lessons/${lessonData.id}/video/confirm`, {
        method: 'POST',
        body: JSON.stringify({ key }),
      });
      if (!confirm?.ok) {
        alert('Error confirmando el video');
        return;
      }

      setLessonData({ ...lessonData, youtubeUrl: key, videoUrl: key });
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
