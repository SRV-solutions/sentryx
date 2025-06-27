import {
    Menu,
    Home,
    BookOpen,
    MessageCircle,
    User,
    LogOut,
    Bell,
    Search,
    SquareLibrary
} from 'lucide-react'; // o usá @mui/icons-material/Notifications si preferís
import Badge from '@mui/material/Badge';

import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import styles from './Sidebar.module.css';

import { useEffect, useRef } from 'react';
import io from 'socket.io-client';
import NotificationDialogs from './NotificationDialogs';

const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(false);
    const { logout, isAdmin, user, authFetch } = useAuth();
    const navigate = useNavigate();
    const { darkMode, toggleTheme } = useTheme();

    const [notifications, setNotifications] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [selected, setSelected] = useState(null);

    const socketRef = useRef(null);

    const unreadCount = notifications.filter(n => !n.read).length;

    const toggleSidebar = () => setCollapsed(!collapsed);
    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const fetchNotifications = async () => {
        try {
            const res = await authFetch(`${import.meta.env.VITE_API_URL}/notifications`);
            if (res.ok) {
                const data = await res.json();
                const formatted = data.map(n => ({
                    id: n.Notification.id,
                    title: n.Notification.title,
                    message: n.Notification.message,
                    read: n.read,
                    createdAt: n.Notification.createdAt
                }));
                setNotifications(formatted);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (!user?.token || !user?.userData?.id) return;

        fetchNotifications();

        socketRef.current = io(import.meta.env.VITE_API_URL, {
            query: { userId: user.userData.id },
            auth: { token: user.token }
        });

        socketRef.current.on('notification', (newNote) => {
            setNotifications(prev => [newNote, ...prev]);
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, [user]);

    return (
        <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
            <div className={styles.header}>
                <button className={styles.menuBtn} onClick={toggleSidebar}>
                    <Menu />
                </button>
                {!collapsed && (
                    <img
                        src="https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/imagotipo.png"
                        alt="Logo SRV"
                        className={styles.logoImg}
                    />
                )}
            </div>

            <ul className={styles.navList}>
                {[
                    { to: '/dashboard', label: 'Dashboard', icon: <Home /> },
                    { to: '/perfil/me', label: 'Perfil', icon: <User /> },
                    { to: '/usuarios', label: 'Buscar Perfiles', icon: <Search /> },
                    { to: '/curso', label: 'Mis Cursos', icon: <BookOpen /> },
                    { to: '/chat', label: 'Chats', icon: <MessageCircle /> },
                    ...(isAdmin ? [{ to: '/admin/usuarios', label: 'Usuarios', icon: <User /> }, { to: '/admin/solvix', label: 'Enseñarle a Solvix', icon: <SquareLibrary /> }] : [])
                ].map(({ to, label, icon }) => (
                    <li key={to}>
                        <NavLink
                            to={to}
                            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                        >
                            <span className={styles.icon}>{icon}</span>
                            {!collapsed && <span className={styles.label}>{label}</span>}
                        </NavLink>
                    </li>
                ))}

                {/* 🔔 Notificaciones */}
                <li >

                    <NavLink className={`${styles.navItem}`} onClick={() => setModalOpen(true)}>
                        <Badge badgeContent={unreadCount} color="error">
                            <Bell />
                        </Badge>
                        {!collapsed && <span className={styles.label}>Notificaciones</span>}
                    </NavLink>
                </li>
            </ul>

            <div className={styles.toggleContainer}>
                <button onClick={toggleTheme} className={styles.toggleBtn}>
                    {darkMode ? '☀️' : '🌙'}
                </button>
            </div>

            <div className={styles.logoutContainer}>
                <button onClick={handleLogout} className={styles.logoutBtn}>
                    <span className={styles.icon}><LogOut /></span>
                    {!collapsed && <span className={styles.label}>Cerrar sesión</span>}
                </button>
            </div>

            <NotificationDialogs
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                notifications={notifications}
                setNotifications={setNotifications}
                selected={selected}
                setSelected={setSelected}
                authFetch={authFetch}
            />


        </aside>
    );
};

export default Sidebar;
