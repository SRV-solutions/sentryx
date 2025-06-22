import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext'; // Tu contexto

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';

import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const ResetPassword = () => {
  const query = useQuery();
  const navigate = useNavigate();
  const { darkMode } = useTheme();

  const token = query.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setSnackbar({ open: true, message: 'Por favor completa todos los campos', severity: 'warning' });
      return;
    }
    if (password !== confirmPassword) {
      setSnackbar({ open: true, message: 'Las contraseñas no coinciden', severity: 'warning' });
      return;
    }
    if (!token) {
      setSnackbar({ open: true, message: 'Token inválido o inexistente', severity: 'error' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Contraseña restablecida con éxito', severity: 'success' });
        setTimeout(() => navigate('/login'), 2000);
      } else {
        const data = await res.json();
        setSnackbar({ open: true, message: data.message || 'Error al restablecer la contraseña', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al conectar con el servidor', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      maxWidth={400}
      margin="2rem auto"
      padding="1rem"
      borderRadius={2}
      boxShadow={3}
      sx={{
        bgcolor: darkMode ? '#121212' : 'background.paper',
        color: darkMode ? '#eee' : 'text.primary',
      }}
    >
      <Typography variant="h5" component="h2" gutterBottom sx={{ color: darkMode ? '#00FFF7' : 'primary.main' }}>
        Restablecer contraseña
      </Typography>
      <form onSubmit={handleSubmit}>
        <TextField
          label="Nueva contraseña"
          type={showPassword ? 'text' : 'password'}
          variant="outlined"
          fullWidth
          margin="normal"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          InputProps={{
            style: {
              color: darkMode ? '#eee' : undefined,
            },
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((show) => !show)}
                  edge="end"
                  sx={{ color: darkMode ? '#eee' : undefined }}
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiInputLabel-root': {
              color: darkMode ? '#bbb' : undefined,
            },
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: darkMode ? '#555' : undefined,
              },
              '&:hover fieldset': {
                borderColor: darkMode ? '#00FFF7' : undefined,
              },
              '&.Mui-focused fieldset': {
                borderColor: darkMode ? '#00FFF7' : undefined,
              },
            },
          }}
        />
        <TextField
          label="Confirmar nueva contraseña"
          type={showConfirmPassword ? 'text' : 'password'}
          variant="outlined"
          fullWidth
          margin="normal"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          InputProps={{
            style: {
              color: darkMode ? '#eee' : undefined,
            },
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowConfirmPassword((show) => !show)}
                  edge="end"
                  sx={{ color: darkMode ? '#eee' : undefined }}
                >
                  {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiInputLabel-root': {
              color: darkMode ? '#bbb' : undefined,
            },
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: darkMode ? '#555' : undefined,
              },
              '&:hover fieldset': {
                borderColor: darkMode ? '#00FFF7' : undefined,
              },
              '&.Mui-focused fieldset': {
                borderColor: darkMode ? '#00FFF7' : undefined,
              },
            },
          }}
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={loading}
          sx={{
            mt: 2,
            bgcolor: darkMode ? '#00FFF7' : undefined,
            color: darkMode ? '#000' : undefined,
            '&:hover': {
              bgcolor: darkMode ? '#00e6d9' : undefined,
            },
          }}
        >
          {loading ? 'Restableciendo...' : 'Restablecer contraseña'}
        </Button>
      </form>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ResetPassword;
