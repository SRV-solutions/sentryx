import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    Menu,
    Home,
    BookOpen,
    CalendarDays,
    ClipboardList,
    MessageCircle,
    Bell,
    User,
    Settings,
    BarChart2,
    Users,
} from 'lucide-react';
import styles from './Sidebar.module.css';

const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(false);

    const toggleSidebar = () => {
        setCollapsed(!collapsed);
    };

    const navItems = [
        { to: '/dashboard', label: 'Dashboard', icon: <Home /> },
        { to: '/perfil', label: 'Perfil', icon: <User /> },
        { to: '/curso', label: 'Mi Curso', icon: <BookOpen /> },
        { to: '/asistencias', label: 'Mis Asistencias', icon: <Users /> },
        { to: '/boletin', label: 'Mi Boletín', icon: <BarChart2 /> },
        { to: '/calendario', label: 'Calendario', icon: <CalendarDays /> },
        { to: '/tareas', label: 'Tareas', icon: <ClipboardList /> },
        { to: '/chat', label: 'Chat IA', icon: <MessageCircle /> },
        { to: '/notificaciones', label: 'Notificaciones', icon: <Bell /> },
        { to: '/configuracion', label: 'Configuración', icon: <Settings /> },
    ];

    return (
        <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
            <div className={styles.header}>
                <button className={styles.menuBtn} onClick={toggleSidebar}>
                    <Menu />
                </button>
                {!collapsed && (
                    <>
                        <img
                            src="https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/imagotipo.png"
                            alt="Logo SRV"
                            className={styles.logoImg}
                        /></>
                )}

            </div>
            <ul className={styles.navList}>
                {navItems.map(({ to, label, icon }) => (
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
            </ul>
        </aside>
    );
};

export default Sidebar;
