import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ChangePassword from '../components/ChangePassword';
import { Link } from 'react-router-dom';

import {
  Avatar,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  Box,
  Divider,
  Paper,
  useMediaQuery,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import { Edit } from '@mui/icons-material';
import styles from './UserProfile.module.css';

const UserProfile = () => {
  const { user, updateUserData } = useAuth();
  const { darkMode } = useTheme();
  const isMobile = useMediaQuery('(max-width:600px)');
  const myCourses = user?.userData?.courses

  const [showEdit, setShowEdit] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [formData, setFormData] = useState({
    firstName: user?.userData?.firstName || '',
    lastName: user?.userData?.lastName || '',
    username: user?.userData?.username || '',
    phone: user?.userData?.phone || '',
    biography: user?.userData?.biography || '',
    avatar: user?.userData?.avatar || 'https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/logotipo.png',
  });

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSave = async () => {
    try {
      await updateUserData?.(formData);
      setShowEdit(false);
    } catch (err) {
      console.error('Error al guardar perfil:', err);
    }
  };


  if (!user) {
    return (
      <Box
        sx={{
          height: '100vh',
          bgcolor: darkMode ? '#121212' : '#f9fafb',
          color: darkMode ? '#e0e0e0' : '#222',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        }}
      >
        <Typography variant="h6">No hay usuario autenticado</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100vh',
        bgcolor: darkMode ? '#121212' : '#f9fafb',
        color: darkMode ? '#e0e0e0' : '#222',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        p: 3,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <br />
      <br />

      {/* PERFIL */}
      <Paper
        elevation={darkMode ? 10 : 2}
        sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'center' : 'flex-start',
          gap: 3,
          padding: 4,
          maxWidth: '100%',
          backgroundColor: darkMode ? '#1e1e1e' : '#fff',
          color: darkMode ? '#f1f1f1' : '#333',
          borderRadius: 2,
          mb: 4,
        }}
      >
        <Avatar
          src={formData.avatar}
          sx={{ width: 140, height: 140 }}
        />

        <Box flex={1}>
          <Typography variant="h5" fontWeight="bold">
            {formData.firstName} {formData.lastName}
          </Typography>
          <Typography variant="subtitle1" color="textSecondary" sx={{ mb: 1 }}>
            @{formData.username || 'usuario'}
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {formData.biography || 'Agrega una descripción...'}
          </Typography>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="body2"><strong>Email:</strong> {user.userData.email}</Typography>
          <Typography variant="body2"><strong>Teléfono:</strong> {formData.phone || 'No especificado'}</Typography>

          <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<Edit />}
              onClick={() => setShowEdit(true)}
            >
              Editar Perfil
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setShowChangePassword(true)}
            >
              Cambiar Contraseña
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* CURSOS COMPRADOS */}
      <Typography variant="h5" gutterBottom>Mis Cursos</Typography>
      {myCourses.length === 0 ? (
        <Typography>Aun no tenes cursos</Typography>
      ) : (
        <Grid container spacing={3}>
          {myCourses.map(({ id, grantedAt, Course }) => (
            <Grid item xs={12} sm={6} md={4} key={id}>
              <Link
                to={`/curso/${Course.id}`}
                style={{ textDecoration: 'none' }}
                aria-label={`Ver curso ${Course.title}`}
              >
                <Card
                  sx={{
                    bgcolor: darkMode ? '#2c2c2c' : '#fff',
                    color: darkMode ? '#eee' : '#111',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Imagen del curso */}
                  {Course.thumbnailUrl && (
                    <Box
                      component="img"
                      src={Course.thumbnailUrl}
                      alt={Course.title}
                      sx={{
                        width: '100%',
                        height: 140,
                        objectFit: 'cover',
                        borderTopLeftRadius: 4,
                        borderTopRightRadius: 4,
                      }}
                    />
                  )}
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" gutterBottom>{Course.title}</Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                      {Course.description}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Comprado el: {new Date(grantedAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                </Card>
              </Link>
            </Grid>
          ))}
        </Grid>
      )}

      {/* MODAL EDITAR PERFIL */}
      <Dialog open={showEdit} onClose={() => setShowEdit(false)} fullWidth maxWidth="sm">
        <DialogTitle>Editar Perfil</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Nombre" name="firstName" value={formData.firstName} onChange={handleChange} fullWidth />
          <TextField label="Apellido" name="lastName" value={formData.lastName} onChange={handleChange} fullWidth />
          <TextField label="Username" name="username" value={formData.username} onChange={handleChange} fullWidth />
          <TextField label="Teléfono" name="phone" value={formData.phone} onChange={handleChange} fullWidth />
          <TextField label="Biografia" name="biography" value={formData.biography} onChange={handleChange} multiline rows={3} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEdit(false)}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained" color="primary">Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* MODAL CAMBIAR CONTRASEÑA */}
      {showChangePassword && (
        <div
          className={`${styles.modalBackdrop}`}
          onClick={() => setShowChangePassword(false)}
        >
          <div
            className={`${styles.modalContent} ${darkMode ? styles.darkModalContent : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className={styles.modalCloseBtn} onClick={() => setShowChangePassword(false)}>&times;</button>
            <ChangePassword onClose={() => setShowChangePassword(false)} />
          </div>
        </div>
      )}
    </Box>
  );
};

export default UserProfile;
