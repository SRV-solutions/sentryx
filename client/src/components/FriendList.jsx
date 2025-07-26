import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';

import {
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  CircularProgress,
  Box,
  Paper,
  Snackbar,
  Alert,
} from '@mui/material';

import ChatIcon from '@mui/icons-material/Chat';

const apiUrl = import.meta.env.VITE_API_URL;

const FriendList = () => {
  const { authFetch } = useAuth();
  const { darkMode } = useTheme();

  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Snackbar state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  const navigate = useNavigate();


  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const res = await authFetch(`${apiUrl}/friends`);
        if (!res.ok) throw new Error('Error al cargar la lista de amigos');
        const data = await res.json();
        setFriends(data);
      } catch (err) {
        setError(err.message || 'Error inesperado');
      } finally {
        setLoading(false);
      }
    };

    fetchFriends();
  }, []);

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const handleChatClick = async (friendId) => {
    try {
      const res = await authFetch(`${apiUrl}/chats/private`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendId }),
      });

      if (!res.ok) throw new Error('No se pudo crear o recuperar el chat');

      const chat = await res.json();

      // Redirigir al chat por ID
      navigate(`/chat/${chat.id}`);
    } catch (error) {
      console.error(error);
      setSnackbarMessage('Error al abrir el chat');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  if (loading)
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );

  if (error)
    return (
      <Typography color="error" align="center" mt={3}>
        {error}
      </Typography>
    );

  if (friends.length === 0)
    return (
      <Typography align="center" mt={3}>
        Aún no tienes amigos agregados.
      </Typography>
    );

  return (
    <>
      <Paper
        elevation={3}
        sx={{
          maxWidth: 600,
          margin: '2rem auto',
          p: 2,
          bgcolor: darkMode ? '#121212' : '#fff',
          color: darkMode ? '#eee' : '#000',
          borderRadius: 2,
        }}
      >
        <Typography
          variant="h5"
          component="h2"
          gutterBottom
          sx={{ color: darkMode ? '#90caf9' : '#1976d2', fontWeight: 'bold' }}
        >
          Mis amigos
        </Typography>

        <List>
          {friends.map((friend) => (
            <ListItem key={friend.id} divider>
              <ListItemAvatar>
                <Avatar
                  alt={`${friend.firstName} ${friend.lastName}`}
                  src={friend.avatar || '/default-avatar.png'}
                  sx={{ width: 48, height: 48 }}
                />
              </ListItemAvatar>
              <ListItemText
                primary={`${friend.firstName} ${friend.lastName}`}
                secondary={`@${friend.username}`}
                primaryTypographyProps={{
                  sx: { fontWeight: 'bold', color: darkMode ? '#bbdefb' : '#0d47a1' },
                }}
                secondaryTypographyProps={{
                  sx: { color: darkMode ? '#90a4ae' : '#555' },
                }}
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  color="primary"
                  onClick={() => handleChatClick(friend.id)}
                >
                  <ChatIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Paper>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default FriendList;
