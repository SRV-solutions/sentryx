import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    useTheme
} from '@mui/material';

const NotificationDialogs = ({
    open,
    onClose,
    notifications,
    setNotifications,
    selected,
    setSelected,
    authFetch
}) => {
    const muiTheme = useTheme();

    const handleClick = async (note) => {
        setSelected(note);
        if (!note.read) {
            try {
                const res = await authFetch(`${import.meta.env.VITE_API_URL}/notifications/${note.id}`, {
                    method: 'PATCH',
                });

                if (res.ok) {
                    setNotifications(prev =>
                        prev.map(n => n.id === note.id ? { ...n, read: true } : n)
                    );
                }
            } catch (err) {
                console.error('Error al marcar como leída', err);
            }
        }
    };

    const getBackgroundColor = (read) => {
        if (read) {
            return muiTheme.palette.mode === 'dark' ? '#2e2e2e' : '#f5f5f5';
        }
        return muiTheme.palette.mode === 'dark' ? '#424242' : '#e3f2fd';
    };
    return (
        <>
            {/* Lista de notificaciones */}
            <Dialog open={open} onClose={() => {
                onClose();
                setSelected(null);
            }} fullWidth maxWidth="sm">
                <DialogTitle>Notificaciones</DialogTitle>
                <DialogContent dividers>
                    {notifications.length > 0 ? (
                        notifications.map(note => (
                            <Box
                                key={note.id}
                                sx={{
                                    mb: 2,
                                    p: 2,
                                    borderRadius: 2,
                                    bgcolor: getBackgroundColor(note.read),
                                    cursor: 'pointer',
                                    transition: 'background-color 0.3s',
                                    '&:hover': {
                                        bgcolor: muiTheme.palette.mode === 'dark'
                                            ? '#616161'
                                            : '#bbdefb',
                                    }
                                }}
                                onClick={() => handleClick(note)}
                            >
                                <Typography variant="subtitle1" fontWeight={note.read ? 'normal' : 'bold'}>
                                    {note.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {new Date(note.createdAt).toLocaleString()}
                                </Typography>
                            </Box>
                        ))
                    ) : (
                        <Typography variant="body2">Sin notificaciones</Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        onClose();
                        setSelected(null);
                    }}>Cerrar</Button>
                </DialogActions>
            </Dialog>

            {/* Detalle individual */}
            <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
                <DialogTitle>{selected?.title}</DialogTitle>
                <DialogContent dividers>
                    <Box
                        sx={{ color: muiTheme.palette.text.primary, fontSize: '16px', lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: selected?.message }}
                    />


                    {selected?.link && (
                        <Typography variant="body2" color="primary" >
                            <a href={selected.link}>
                                {selected.link}
                            </a>
                        </Typography>
                    )}

                    <Typography variant="caption">
                        Fecha: {new Date(selected?.createdAt).toLocaleString()}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSelected(null)}>Cerrar</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default NotificationDialogs;
