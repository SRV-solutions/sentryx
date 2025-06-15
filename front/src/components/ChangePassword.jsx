import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
    TextField,
    IconButton,
    InputAdornment,
    Button,
    Typography,
    Box,
    Paper,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

const apiUrl = import.meta.env.VITE_API_URL;

const ChangePassword = ({ onClose }) => {
    const { darkMode } = useTheme();
    const { authFetch } = useAuth();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState({
        current: false,
        new: false,
        confirm: false,
    });
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const toggleShow = (field) => {
        setShowPassword((prev) => ({ ...prev, [field]: !prev[field] }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (newPassword !== confirmPassword) {
            setErrorMsg('Las contraseñas no coinciden');
            return;
        }

        if (newPassword.length < 6) {
            setErrorMsg('La nueva contraseña debe tener al menos 6 caracteres');
            return;
        }

        setLoading(true);
        try {
            const response = await authFetch(`${apiUrl}/users/change-password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            const data = await response.json();

            if (!response.ok) {
                setErrorMsg(data.message || 'Error desconocido');
            } else {
                setSuccessMsg('Contraseña cambiada con éxito');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                if (onClose) setTimeout(onClose, 1500);
            }
        } catch (error) {
            setErrorMsg('Error al conectar con el servidor');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                backgroundColor: darkMode ? '#121212' : '#fff',
                color: darkMode ? '#fff' : '#000',
                padding: 4,
                borderRadius: 2,
                maxWidth: 400,
                margin: '0 auto',
                boxShadow: 3,
            }}
            component={Paper}
            elevation={darkMode ? 6 : 1}
        >
            <Typography variant="h6" gutterBottom>
                Cambiar contraseña
            </Typography>
            <form onSubmit={handleSubmit}>
                <TextField
                    label="Contraseña actual"
                    type={showPassword.current ? 'text' : 'password'}
                    fullWidth
                    margin="normal"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <IconButton
                                    onClick={() => toggleShow('current')}
                                    edge="end"
                                    size="small"
                                >
                                    {showPassword.current ? <VisibilityOff /> : <Visibility />}
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
                />

                <TextField
                    label="Nueva contraseña"
                    type={showPassword.new ? 'text' : 'password'}
                    fullWidth
                    margin="normal"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <IconButton
                                    onClick={() => toggleShow('new')}
                                    edge="end"
                                    size="small"
                                >
                                    {showPassword.new ? <VisibilityOff /> : <Visibility />}
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
                />

                <TextField
                    label="Confirmar nueva contraseña"
                    type={showPassword.confirm ? 'text' : 'password'}
                    fullWidth
                    margin="normal"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <IconButton
                                    onClick={() => toggleShow('confirm')}
                                    edge="end"
                                    size="small"
                                >
                                    {showPassword.confirm ? <VisibilityOff /> : <Visibility />}
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
                />

                {errorMsg && (
                    <Typography color="error" sx={{ mt: 1 }}>
                        {errorMsg}
                    </Typography>
                )}
                {successMsg && (
                    <Typography color="success.main" sx={{ mt: 1 }}>
                        {successMsg}
                    </Typography>
                )}

                <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    fullWidth
                    disabled={loading}
                    sx={{ mt: 2 }}
                >
                    {loading ? 'Guardando...' : 'Guardar'}
                </Button>
            </form>
        </Box>
    );
};

export default ChangePassword;
