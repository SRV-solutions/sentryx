import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

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
    Button,
    Paper,
    Snackbar,
    Alert,
} from '@mui/material';

import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

const apiUrl = import.meta.env.VITE_API_URL;

const FriendRequests = () => {
    const { authFetch } = useAuth();
    const { darkMode } = useTheme();

    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Snackbar state
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarSeverity, setSnackbarSeverity] = useState('success'); // 'error' or 'success'

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const res = await authFetch(`${apiUrl}/friends/requests/received`);
            if (!res.ok) throw new Error('Error cargando solicitudes');
            const data = await res.json();
            setRequests(data);
        } catch (err) {
            setError(err.message || 'Error inesperado');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleSnackbarClose = () => {
        setSnackbarOpen(false);
    };

    const handleAction = async (requestId, action) => {
        // Ajusto a los endpoints que me diste
        const endpointMap = {
            accept: `/friends/requests/${requestId}/accept`,
            reject: `/friends/requests/${requestId}/reject`,
        };

        try {
            const res = await authFetch(`${apiUrl}${endpointMap[action]}`, {
                method: 'POST',
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Error procesando la acción');
            }

            // Actualizo la lista quitando la solicitud procesada
            setSnackbarMessage(`Solicitud ${action === 'accept' ? 'aceptada' : 'rechazada'} correctamente.`);
            setSnackbarSeverity('success');
            setSnackbarOpen(true);
            setTimeout(() => {
                setRequests((prev) => prev.filter((r) => r.id !== requestId));
            }, 2000);
        } catch (err) {
            // Mostrar snackbar de error
            setSnackbarMessage(err.message || 'Error al procesar la acción');
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

    if (requests.length === 0)
        return (
            <Typography align="center" mt={3}>
                No hay solicitudes pendientes.
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
                    Solicitudes de amistad pendientes
                </Typography>

                <List>
                    {requests.map(({ id, requester, status }) => (
                        <ListItem
                            key={id}
                            divider
                            secondaryAction={
                                <Box>
                                    <Button
                                        variant="contained"
                                        color="success"
                                        size="small"
                                        startIcon={<CheckIcon />}
                                        disabled={status !== 'pending'}
                                        onClick={() => handleAction(id, 'accept')}
                                        sx={{ mr: 1 }}
                                    >
                                        Aceptar
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        size="small"
                                        startIcon={<CloseIcon />}
                                        disabled={status !== 'pending'}
                                        onClick={() => handleAction(id, 'reject')}
                                    >
                                        Rechazar
                                    </Button>
                                </Box>
                            }
                        >
                            <ListItemAvatar>
                                <Avatar
                                    alt={`${requester.firstName} ${requester.lastName}`}
                                    src={requester.avatar || '/default-avatar.png'}
                                    sx={{ width: 48, height: 48 }}
                                />
                            </ListItemAvatar>
                            <ListItemText
                                primary={`${requester.firstName} ${requester.lastName}`}
                                secondary={`@${requester.username}`}
                                primaryTypographyProps={{
                                    sx: { fontWeight: 'bold', color: darkMode ? '#bbdefb' : '#0d47a1' },
                                }}
                                secondaryTypographyProps={{
                                    sx: { color: darkMode ? '#90a4ae' : '#555' },
                                }}
                            />
                        </ListItem>
                    ))}
                </List>
            </Paper>

            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3500}
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

export default FriendRequests;
