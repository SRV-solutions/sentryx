import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';

const Register = () => {
    const [form, setForm] = useState({ username: '', email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [openSnackbar, setOpenSnackbar] = useState(false);
    const [snackbarMsg, setSnackbarMsg] = useState('');
    const { login } = useAuth(); // usar login automático después
    const navigate = useNavigate();
    const { darkMode, toggleTheme } = useTheme();

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.username || !form.email || !form.password || !form.firstName || !form.lastName) {
            setSnackbarMsg('Todos los campos son obligatorios');
            setOpenSnackbar(true);
            return;
        }

        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/users/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error al registrarse');
            }

            // Login automático
            await login(form.email, form.password);
            navigate('/dashboard');
        } catch (error) {
            setSnackbarMsg(error.message);
            setOpenSnackbar(true);
        }
    };

    const handleCloseSnackbar = () => setOpenSnackbar(false);

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
                <h2 className={styles.title}>Crear cuenta</h2>
                <form className={styles.form} onSubmit={handleSubmit}>
                    <TextField
                        label="Nombre de usuario"
                        name="username"
                        value={form.username}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                        required
                        variant="outlined"
                        InputLabelProps={{ style: { color: 'white' } }}
                    />
                    <TextField
                        label="Nombre"
                        name="firstName"
                        value={form.firstName}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                        required
                        variant="outlined"
                        InputLabelProps={{ style: { color: 'white' } }}
                    />
                    <TextField
                        label="Apellido"
                        name="lastName"
                        value={form.lastName}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                        required
                        variant="outlined"
                        InputLabelProps={{ style: { color: 'white' } }}
                    />
                    <TextField
                        label="Correo electrónico"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                        required
                        variant="outlined"
                        InputLabelProps={{ style: { color: 'white' } }}
                    />
                    <TextField
                        label="Contraseña"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                        required
                        variant="outlined"
                        InputLabelProps={{ style: { color: 'white' } }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />

                    <button type="submit" className={styles.button}>
                        Registrarse
                    </button>
                    <p style={{ marginTop: '1rem', textAlign: 'center', color: 'white' }}>
                        ¿Ya tenés cuenta?{' '}
                        <Link to="/login" style={{ color: '#00FFF7' }}>
                            Iniciá sesión
                        </Link>
                    </p>
                </form>
            </div>

            <Snackbar open={openSnackbar} autoHideDuration={6000} onClose={handleCloseSnackbar}>
                <Alert onClose={handleCloseSnackbar} severity="error" sx={{ width: '100%' }}>
                    {snackbarMsg}
                </Alert>
            </Snackbar>
        </div>
    );
};

export default Register;
