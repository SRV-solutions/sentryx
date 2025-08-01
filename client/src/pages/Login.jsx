import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

import styles from './Login.module.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const { darkMode, toggleTheme } = useTheme();

  // Snackbar
  const [openSnackbar, setOpenSnackbar] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setOpenSnackbar(true);
      return;
    }
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setOpenSnackbar(true);
    }
  };

  const handleCloseSnackbar = () => {
    setOpenSnackbar(false);
  };

  const handleContactSupport = () => {
    const asunto = encodeURIComponent('Problema de acceso al portal Sentryx');
    const cuerpo = encodeURIComponent(
      `Hola equipo de weareSRV,%0D%0A%0D%0AEstoy intentando ingresar al portal pero no puedo acceder con mi correo electrónico y contraseña.%0D%0ACorreo: ${email}%0D%0A¿Podrían ayudarme a restablecerla?%0D%0A%0D%0AGracias.`
    );
    window.location.href = `mailto:info@wearesrv.com?subject=${asunto}&body=${cuerpo}`;
  };

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add(styles.dark);
    } else {
      document.body.classList.remove(styles.dark);
    }
  }, [darkMode]);

  return (
    <div className={`${styles.container} ${darkMode ? styles.dark : ''}`}>
      <div className={styles.toggleWrapper}>
        <label className={styles.switch}>
          <input type="checkbox" checked={darkMode} onChange={toggleTheme} />
          <span className={styles.slider}></span>
        </label>
        <>{darkMode ? 'Dark Mode' : 'Light Mode'}</>
      </div>

      <div className={styles.card}>
        <h2 className={styles.title}>Iniciar Sesión</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <TextField
            label='Correo Electrónico'
            InputLabelProps={{ style: { color: 'white' } }}
            InputProps={{
              className: darkMode ? styles.inputDark : styles.inputLight,
            }}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            margin="normal"
            required
            variant="outlined"
          />

          <TextField
            label="Contraseña"
            InputLabelProps={{ style: { color: 'white' } }}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            margin="normal"
            required
            variant="outlined"
            InputProps={{
              className: darkMode ? styles.inputDark : styles.inputLight,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    size="small"
                    color="info"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <button type="submit" className={styles.button}>
            Ingresar
          </button>
          <p style={{ marginTop: '1rem', textAlign: 'center' }}>
            ¿Olvidaste tu contraseña?{' '}
            <Link to="/forgot-password" style={{ color: '#00FFF7' }}>
              Recuperarla acá
            </Link>
          </p>
          <p style={{ marginTop: '1rem', textAlign: 'center' }}>
            ¿Aun no tenes cuenta?{' '}
            <Link to="/register" style={{ color: '#00FFF7' }}>
              Registrate aca
            </Link>
          </p>
        </form>
      </div>

      <Snackbar open={openSnackbar} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert
          onClose={handleCloseSnackbar}
          severity="error"
          sx={{ width: '100%' }}
        >
          No se pudo iniciar sesión. Verifica tus datos o contacta soporte.
        </Alert>
      </Snackbar>
    </div>
  );
};

export default Login;
