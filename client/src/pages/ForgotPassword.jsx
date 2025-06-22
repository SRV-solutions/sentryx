import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';

const ForgotPassword = () => {
  const { darkMode } = useTheme();
  const navigate = useNavigate();  // <-- hook de react-router
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setSnackbar({ open: true, message: 'Por favor, ingresa un correo válido', severity: 'warning' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/users/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'Si el correo existe, se envió una contraseña temporal', severity: 'success' });
        setEmail('');
      } else {
        throw new Error('Error al enviar la solicitud');
      }
    } catch (error) {
      setSnackbar({ open: true, message: 'Error al procesar la solicitud', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      maxWidth={400}
      margin="2rem auto"
      padding="1rem"
      bgcolor={darkMode ? '#1B1B1B' : 'white'}
      borderRadius={2}
      boxShadow={3}
    >
      <Button
        onClick={() => navigate('/login')}
        variant="text"
        sx={{ mb: 2 }}
      >
        ← Volver al login
      </Button>

      <Typography variant="h5" component="h2" gutterBottom>
        Recuperar contraseña
      </Typography>

      <form onSubmit={handleSubmit}>
        <TextField
          label="Correo electrónico"
          type="email"
          variant="outlined"
          fullWidth
          margin="normal"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <Button type="submit" variant="contained" color="primary" fullWidth disabled={loading} sx={{ mt: 2 }}>
          {loading ? 'Enviando...' : 'Enviar'}
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

export default ForgotPassword;
