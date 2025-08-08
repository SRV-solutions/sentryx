import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Avatar,
  Typography,
  Box,
  Divider,
  Paper,
  useMediaQuery,
  CircularProgress,
  Button,
  Snackbar,
  Alert,
} from '@mui/material';

const UserPublicProfile = () => {
  const { id } = useParams();
  const { authFetch, user } = useAuth();
  const { darkMode } = useTheme();
  const isMobile = useMediaQuery('(max-width:600px)');

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestSent, setRequestSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [isFriend, setIsFriend] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const checkFriendshipStatus = async () => {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/friends/status/${id}`);
      if (!res.ok) throw new Error('Error al verificar estado de amistad');
      const data = await res.json();
      setIsFriend(data.isFriend);
      setHasPendingRequest(data.hasPendingRequest);
    } catch (err) {
      console.error('Error al verificar estado de amistad', err);
    }
  };

  const sendFriendRequest = async () => {
    setSending(true);
    setError('');

    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/friends/requests/${id}`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al enviar solicitud');
      }

      setRequestSent(true);
      setSnackbar({
        open: true,
        message: 'Solicitud de amistad enviada con éxito 🎉',
        severity: 'success',
      });
    } catch (err) {
      setError(err.message || 'Ocurrió un error');
      setSnackbar({
        open: true,
        message: err.message || 'Ocurrió un error al enviar la solicitud',
        severity: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await authFetch(`${import.meta.env.VITE_API_URL}/users/public/${id}`);
        if (!res || !res.ok) throw new Error('Error al cargar perfil');
        const data = await res.json();
        setProfile(data);
      } catch (err) {
        console.error(err);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
    checkFriendshipStatus();
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ p: 5, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!profile) {
    return (
      <Box sx={{ p: 5, textAlign: 'center' }}>
        <Typography variant="h6">Perfil no encontrado.</Typography>
      </Box>
    );
  }

  const { firstName, lastName, username, biography, avatar, email } = profile;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: darkMode ? '#121212' : '#f9fafb',
        color: darkMode ? '#e0e0e0' : '#222',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        p: 3,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <br />
      <br />
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
        <Avatar src={avatar} alt={username} sx={{ width: 140, height: 140 }} />
        <Box flex={1}>
          <Typography variant="h5" fontWeight="bold">
            {firstName} {lastName}
          </Typography>
          <Typography variant="subtitle1" color="textSecondary" sx={{ mb: 1 }}>
            @{username}
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {biography || 'Este usuario no tiene biografía.'}
          </Typography>

          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2">
            <strong>Email:</strong> {email}
          </Typography>

          {user?.id !== profile.id && (
            <Box sx={{ mt: 3 }}>
              {isFriend ? (
                <Typography variant="body2" color="success.main">
                  Ya son amigos 😊
                </Typography>
              ) : hasPendingRequest || requestSent ? (
                <Typography variant="body2" color="warning.main">
                  Solicitud ya enviada ⏳
                </Typography>
              ) : (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={sendFriendRequest}
                  disabled={sending}
                  sx={{ borderRadius: 2, px: 3, py: 1, textTransform: 'none' }}
                >
                  {sending ? 'Enviando...' : 'Enviar solicitud de amistad'}
                </Button>
              )}

              {error && (
                <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                  {error}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default UserPublicProfile;
