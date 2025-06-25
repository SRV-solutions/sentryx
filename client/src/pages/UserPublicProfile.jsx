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
} from '@mui/material';

const UserPublicProfile = () => {
  const { id } = useParams();
  const { authFetch, user } = useAuth();
  const { darkMode } = useTheme();
  const isMobile = useMediaQuery('(max-width:600px)');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const { firstName, lastName, username, biography, avatar, phone, email } = profile;

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
        <Avatar
          src={avatar}
          alt={username}
          sx={{ width: 140, height: 140 }}
        />
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
          <Typography variant="body2"><strong>Email:</strong> {email}</Typography>
          <Typography variant="body2"><strong>Teléfono:</strong> {phone || 'No especificado'}</Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default UserPublicProfile;
