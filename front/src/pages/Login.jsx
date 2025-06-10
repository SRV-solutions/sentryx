import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';

const Login = () => {
  const [email, setEmail] = useState('marcos.costa@wearesrv.com');
  const [password, setPassword] = useState('123456789');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      alert('Por favor completa email y contraseña.');
      return;
    }
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
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
            onChange={() => setDarkMode(!darkMode)}
          />
          <span className={styles.slider}></span>
        </label>
        <span className={styles.toggleLabel}>{darkMode ? 'Dark Mode' : 'Light Mode'}</span>
      </div>

      <div className={styles.card}>
        <h2 className={styles.title}>Iniciar Sesión</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label}>Correo electrónico</label>
          <input
            type="email"
            className={styles.input}
            placeholder="ejemplo@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className={styles.label}>Contraseña</label>
          <input
            type="password"
            className={styles.input}
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
