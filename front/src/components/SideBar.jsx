import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    Menu,
    Home,
    BookOpen,
    MessageCircle,
    User,
    LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import styles from './Sidebar.module.css';

const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(false);
    const { logout } = useAuth();
    const navigate = useNavigate();

    const toggleSidebar = () => {
        setCollapsed(!collapsed);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navItems = [
        { to: '/dashboard', label: 'Dashboard', icon: <Home /> },
        { to: '/perfil', label: 'Perfil', icon: <User /> },
        { to: '/curso', label: 'Mi Curso', icon: <BookOpen /> },
        { to: '/chat', label: 'Chat IA', icon: <MessageCircle /> },
    ];

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
                {navItems.map(({ to, label, icon }) => (
                    <li key={to}>
                        <NavLink
                            to={to}
                            className={({ isActive }) =>
                                `${styles.navItem} ${isActive ? styles.active : ''}`
                            }
                        >
                            <span className={styles.icon}>{icon}</span>
                            {!collapsed && <span className={styles.label}>{label}</span>}
                        </NavLink>
                    </li>
                ))}
            </ul>

            <div className={styles.logoutContainer}>
                <button onClick={handleLogout} className={styles.logoutBtn}>
                    <span className={styles.icon}><LogOut /></span>
                    {!collapsed && <span className={styles.label}>Cerrar sesión</span>}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
