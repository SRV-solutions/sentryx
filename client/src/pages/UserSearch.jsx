import { useState } from 'react';
import {
  TextField,
  Box,
  Avatar,
  Typography,
  Grid,
  CircularProgress,
  Card,
  CardContent,
  Button
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Link } from 'react-router-dom';

const UserSearch = () => {
  const { authFetch, user } = useAuth();
  const { darkMode } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    const value = e.target.value;
    setQuery(value);

    if (value.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/users/search?q=${value}`);
      if (!res || !res.ok) throw new Error('Error en la búsqueda');
      const data = await res.json();

      // Evitar mostrarme a mí mismo
      const filtered = data.filter(u => u.id !== user.userData.id);

      setResults(filtered);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        bgcolor: darkMode ? '#121212' : '#f4f4f4',
        p: 3,
        minHeight: '100vh'
      }}
    >
      <Typography variant="h4" mb={3}>Buscar Usuarios</Typography>
      <TextField
        label="Buscar por nombre o username"
        fullWidth
        variant="outlined"
        value={query}
        onChange={handleSearch}
      />

      {loading && <CircularProgress sx={{ mt: 3 }} />}

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {results.map((user) => (
          <Grid item xs={12} sm={6} md={4} key={user.id}>
            <Card
              sx={{
                display: 'flex',
                gap: 2,
                alignItems: 'center',
                p: 2,
                bgcolor: darkMode ? '#1e1e1e' : '#fff',
                color: darkMode ? '#f1f1f1' : '#333',
              }}
            >
              <Avatar src={user.avatar} alt={user.username} sx={{ width: 60, height: 60 }} />
              <CardContent sx={{ flex: 1 }}>
                <Typography variant="h6">{user.firstName} {user.lastName}</Typography>
                <Typography variant="body2" color="textSecondary">@{user.username}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {user.biography?.slice(0, 100) || 'Sin biografía'}
                </Typography>
                <Link to={`/perfil/${user.id}`}>
                  <Button sx={{ mt: 1 }} size="small" variant="outlined">Ver Perfil</Button>
                </Link>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default UserSearch;
