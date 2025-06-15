import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext'; // Importa el theme context

import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

import styles from './Login.module.css';

const Login = () => {
  const [email, setEmail] = useState('marcos.costa@wearesrv.com');
  const [password, setPassword] = useState('Trucoteca12*');
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Usamos contexto para modo oscuro
  const { darkMode, toggleTheme } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      alert('Por favor completa email y contraseña.');
      return;
    }
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      alert('Login inválido. Intenta de nuevo.');
    }
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
          <input
            type="checkbox"
            checked={darkMode}
            onChange={toggleTheme}  // <--- Aquí está el toggle correcto
          />
          <span className={styles.slider}></span>
        </label>
        <>{darkMode ? 'Dark Mode' : 'Light Mode'}</>
      </div>

      <div className={styles.card}>
        <h2 className={styles.title}>Iniciar Sesión</h2>
        <form className={styles.form} onSubmit={handleSubmit}>

          <TextField
            label='Correo Electrónico'
            InputLabelProps={{
              style: {
                color: 'white',
              },
            }}
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
            InputLabelProps={{
              style: {
                color: 'white',
              },
            }}
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
                    color='info'
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
        </form>
      </div>
    </div>
  );
};

export default Login;
