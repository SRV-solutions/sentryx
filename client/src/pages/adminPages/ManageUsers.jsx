import {
    Box,
    Button,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Snackbar,
    Alert,
    Pagination
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const apiUrl = import.meta.env.VITE_API_URL;

const ManageUsers = () => {
    const { authFetch } = useAuth();
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', roleId: '', username: '' });
    const [loading, setLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [resetLoading, setResetLoading] = useState(false);
    const [roleUpdatingIds, setRoleUpdatingIds] = useState([]);
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMsg, setSnackbarMsg] = useState('');
    const [snackbarSeverity, setSnackbarSeverity] = useState('success');
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [notificationModalOpen, setNotificationModalOpen] = useState(false);
    const [notificationToAll, setNotificationToAll] = useState(false);
    const [notificationForm, setNotificationForm] = useState({
        title: '',
        message: '',
        type: 'info',
        link: ''
    });
    const [sendingNotification, setSendingNotification] = useState(false);


    const navigate = useNavigate();

    const fetchUsers = async (page = 1, searchTerm = '') => {
        const res = await authFetch(`${apiUrl}/users?page=${page}&limit=10&search=${encodeURIComponent(searchTerm)}`);
        if (res?.ok) {
            const data = await res.json();
            setUsers(data.data);
            if (data.data.length === 0) {
                setSnackbarSeverity('error');
                setSnackbarMsg('Usuario no encontrado');
                setSnackbarOpen(true);
            }
            setTotalPages(data.pagination.totalPages);
        }

    };

    const fetchRoles = async () => {
        const res = await authFetch(`${apiUrl}/roles`);
        if (res?.ok) {
            const data = await res.json();
            setRoles(data);
        }

    };

    useEffect(() => {
        fetchUsers(currentPage, search);
        fetchRoles();
    }, [currentPage, search]);

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setCurrentPage(1);
    };

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setLoading(true);
        const res = await authFetch(`${apiUrl}/users`, {
            method: 'POST',
            body: JSON.stringify(form),
        });
        if (res?.ok) {
            setForm({ firstName: '', lastName: '', email: '', roleId: '', username: '' });
            fetchUsers(currentPage, search);
            setSnackbarSeverity('success');
            setSnackbarMsg('Usuario creado con éxito');
        } else {
            setSnackbarSeverity('error');
            setSnackbarMsg('Error al crear usuario');
        }
        setSnackbarOpen(true);
        setLoading(false);
    };

    const handleResetPassword = async () => {
        setResetLoading(true);
        try {
            const res = await authFetch(`${apiUrl}/users/${selectedUserId}/reset-password`, {
                method: 'POST',
            });
            setDialogOpen(false);
            if (res?.ok) {
                setSnackbarSeverity('success');
                setSnackbarMsg('Contraseña reseteada. Se envió un mail al usuario.');
            } else {
                setSnackbarSeverity('error');
                setSnackbarMsg('Error al resetear la contraseña.');
            }
        } catch {
            setSnackbarSeverity('error');
            setSnackbarMsg('Error al resetear la contraseña.');
        }
        setSnackbarOpen(true);
        setResetLoading(false);
    };

    const handleAssignCourses = (userId) => {
        navigate(`/admin/asignar-cursos/${userId}`);
    };

    const handleRoleChange = async (userId, newRoleId) => {
        setRoleUpdatingIds((prev) => [...prev, userId]);
        try {
            const res = await authFetch(`${apiUrl}/users/update/${userId}`, {
                method: 'PATCH',
                body: JSON.stringify({ roleId: newRoleId }),
            });
            if (res?.ok) {
                setSnackbarSeverity('success');
                setSnackbarMsg('Rol actualizado correctamente');
                setUsers((prevUsers) =>
                    prevUsers.map((u) =>
                        u.id === userId ? { ...u, roleId: newRoleId, Role: roles.find((r) => r.id === newRoleId) } : u
                    )
                );
            } else {
                setSnackbarSeverity('error');
                setSnackbarMsg('Error al actualizar el rol');
            }
        } catch (error) {
            setSnackbarSeverity('error');
            setSnackbarMsg('Error al actualizar el rol');
        }
        setSnackbarOpen(true);
        setRoleUpdatingIds((prev) => prev.filter((id) => id !== userId));
    };



    return (
        <Container maxWidth="lg">
            <Typography variant="h4" gutterBottom sx={{ mt: 4 }}>
                Administrar Usuarios
            </Typography>

            <Box sx={{ mb: 3 }}>
                <TextField
                    label="Buscar usuario"
                    value={search}
                    onChange={handleSearchChange}
                    fullWidth
                />
            </Box>

            <Box component="form" onSubmit={handleCreate} sx={{ mb: 4, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField name="username" label="Nombre de usuario" value={form.username} onChange={handleChange} required />
                <TextField name="firstName" label="Nombre" value={form.firstName} onChange={handleChange} required />
                <TextField name="lastName" label="Apellido" value={form.lastName} onChange={handleChange} required />
                <TextField name="email" label="Email" type="email" value={form.email} onChange={handleChange} required />
                <FormControl sx={{ minWidth: 120 }}>
                    <InputLabel id="role-select-label">Rol</InputLabel>
                    <Select
                        labelId="role-select-label"
                        name="roleId"
                        value={form.roleId}
                        onChange={handleChange}
                        label="Rol"
                        required
                    >
                        <MenuItem value="">
                            <em>Seleccione un rol</em>
                        </MenuItem>
                        {roles.map((role) => (
                            <MenuItem key={role.id} value={role.id}>{role.roleName}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Button variant="contained" color="primary" type="submit" disabled={loading}>
                    {loading ? <CircularProgress size={24} /> : 'Crear Usuario'}
                </Button>
            </Box>

            <Typography variant="h6" gutterBottom>
                Usuarios Existentes
            </Typography>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell align='center'>Seleccionar</TableCell>
                            <TableCell align='center'>Nombre</TableCell>
                            <TableCell align='center'>Email</TableCell>
                            <TableCell align='center'>Rol</TableCell>
                            <TableCell align='center'>Ultimo Login</TableCell>
                            <TableCell align='center'>Cambiar Rol</TableCell>
                            <TableCell align='center'>Acciones</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map((u) => {
                            const fecha = u?.lastLogin ? new Date(u?.lastLogin) : 'Nunca';
                            return (
                                <TableRow key={u.id}>
                                    <TableCell align="center">
                                        <input
                                            type="checkbox"
                                            checked={selectedUserIds.includes(u.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedUserIds([...selectedUserIds, u.id]);
                                                } else {
                                                    setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                                                }
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell align='center'>{u.firstName} {u.lastName}</TableCell>
                                    <TableCell align='center'>{u.email}</TableCell>
                                    <TableCell align='center'>{u?.Role?.roleName || u.role || 'N/D'}</TableCell>
                                    <TableCell align='center'>{fecha.toLocaleString("es-AR")}</TableCell>
                                    <TableCell align='center'>
                                        <FormControl fullWidth size="small" sx={{ minWidth: 120 }}>
                                            <Select
                                                value={u.roleId || (u.Role && u.Role.id) || ''}
                                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                disabled={roleUpdatingIds.includes(u.id)}
                                            >
                                                {roles.map((role) => (
                                                    <MenuItem key={role.id} value={role.id}>{role.roleName}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                    <TableCell align='center'>
                                        <Button variant="contained" color="primary" onClick={() => handleAssignCourses(u.id)} sx={{ mr: 1 }}>
                                            Asignar Cursos
                                        </Button>
                                        <Button variant="contained" color="warning" onClick={() => { setSelectedUserId(u.id); setDialogOpen(true); }} disabled={resetLoading}>
                                            {resetLoading ? <CircularProgress size={24} color="inherit" /> : 'Resetear Contraseña'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            <Box mt={2} display="flex" justifyContent="center" gap={2}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => {
                        setNotificationToAll(false);
                        setNotificationModalOpen(true);
                    }}
                    disabled={selectedUserIds.length === 0}
                >
                    Enviar notificación a seleccionados
                </Button>
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => {
                        setNotificationToAll(true);
                        setNotificationModalOpen(true);
                    }}
                >
                    Enviar notificación a todos
                </Button>
            </Box>

            <Box mt={2} display="flex" justifyContent="center">
                <Pagination
                    count={totalPages}
                    page={currentPage}
                    onChange={(e, value) => setCurrentPage(value)}
                    color="primary"
                />
            </Box>

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                <DialogTitle>Confirmar reseteo</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        ¿Estás seguro de que querés resetear la contraseña de este usuario? Se enviará una nueva por email.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleResetPassword} autoFocus disabled={resetLoading}>
                        {resetLoading ? <CircularProgress size={24} /> : 'Confirmar'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbarOpen}
                autoHideDuration={4000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: '100%' }}>
                    {snackbarMsg}
                </Alert>
            </Snackbar>
            <Dialog open={notificationModalOpen} onClose={() => setNotificationModalOpen(false)}>
                <DialogTitle>Enviar Notificación</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label="Título"
                        value={notificationForm.title}
                        onChange={(e) => setNotificationForm({ ...notificationForm, title: e.target.value })}
                        required
                    />
                    <TextField
                        label="Mensaje"
                        multiline
                        rows={4}
                        value={notificationForm.message}
                        onChange={(e) => setNotificationForm({ ...notificationForm, message: e.target.value })}
                        required
                    />
                    <TextField
                        label="Tipo (info, warning, error)"
                        value={notificationForm.type}
                        onChange={(e) => setNotificationForm({ ...notificationForm, type: e.target.value })}
                    />
                    <TextField
                        label="Link (opcional)"
                        value={notificationForm.link}
                        onChange={(e) => setNotificationForm({ ...notificationForm, link: e.target.value })}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNotificationModalOpen(false)}>Cancelar</Button>
                    <Button
                        onClick={async () => {
                            setSendingNotification(true);
                            const url = `${apiUrl}/notifications/${notificationToAll ? 'all' : 'some'}`;
                            const payload = {
                                ...notificationForm,
                                ...(notificationToAll ? {} : { userIds: selectedUserIds })
                            };

                            const res = await authFetch(url, {
                                method: 'POST',
                                body: JSON.stringify(payload)
                            });

                            setNotificationModalOpen(false);
                            setNotificationForm({ title: '', message: '', type: 'info', link: '' });
                            setSendingNotification(false);

                            if (res?.ok) {
                                setSnackbarSeverity('success');
                                setSnackbarMsg('Notificación enviada con éxito');
                                setSelectedUserIds([]);
                            } else {
                                setSnackbarSeverity('error');
                                setSnackbarMsg('Error al enviar notificación');
                            }

                            setSnackbarOpen(true);
                        }}
                        disabled={sendingNotification}
                    >
                        {sendingNotification ? <CircularProgress size={24} /> : 'Enviar'}
                    </Button>
                </DialogActions>
            </Dialog>

        </Container>
    );
};

export default ManageUsers;
