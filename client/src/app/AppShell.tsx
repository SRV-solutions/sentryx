import { ReactNode, useCallback, useMemo, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Moon, Sun, MoreHorizontal, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSchool } from '../school/SchoolContext';
import { useSocketEvent } from '../context/SocketContext';
import { apiGet, apiSend } from '../lib/api';
import { buildNav, NavItem } from './nav';
import { Sheet, timeAgo, Empty, useToast } from '../ui';

const SRV_LOGO = 'https://wearesrv.com/srv-logo-96.webp';

interface NotificationRow {
  notificationId: number;
  read: boolean;
  Notification: { id: number; title: string; message: string; link?: string | null; createdAt: string };
}

const useBadges = (enabled: boolean) => {
  const announcements = useQuery({
    queryKey: ['badge', 'announcements'],
    queryFn: () => apiGet<{ count: number }>('/school/announcements/unread-count'),
    enabled,
    refetchInterval: 120_000,
  });
  const threads = useQuery({
    queryKey: ['badge', 'threads'],
    queryFn: () => apiGet<{ count: number }>('/school/threads/unread-count'),
    enabled,
    refetchInterval: 120_000,
  });
  return { announcements: announcements.data?.count ?? 0, threads: threads.data?.count ?? 0 };
};

export const AppShell = ({ children, title }: { children: ReactNode; title?: string }) => {
  const { logout, isAdmin, hasPermission } = useAuth() as {
    logout: () => void;
    isAdmin: boolean;
    hasPermission: (e: string, a: string) => boolean;
  };
  const { darkMode, toggleTheme } = useTheme() as { darkMode: boolean; toggleTheme: () => void };
  const { session, can, schools, switchSchool } = useSchool();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [schoolOpen, setSchoolOpen] = useState(false);

  const lms = hasPermission('courses', 'read');
  const nav = useMemo(() => buildNav({ session, can, lms, isAdmin }), [session, can, lms, isAdmin]);
  const badges = useBadges(!!session);

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<NotificationRow[]>('/notifications?limit=40'),
    staleTime: 60_000,
  });
  const unreadNotifications = notifications.data?.filter((n) => !n.read).length ?? 0;

  // Tiempo real: cualquier aviso nuevo refresca contadores y listas afectadas.
  const onNotification = useCallback(
    (n: { title: string; type?: string }) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['badge'] });
      if (n.type === 'announcement') qc.invalidateQueries({ queryKey: ['announcements'] });
      if (n.type === 'alert') qc.invalidateQueries({ queryKey: ['alerts'] });
      if (document.visibilityState === 'visible' && n.type !== 'message') toast(n.title);
    },
    [qc, toast]
  );
  useSocketEvent('notification', onNotification);
  const onThread = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['badge', 'threads'] });
    qc.invalidateQueries({ queryKey: ['threads'] });
  }, [qc]);
  useSocketEvent('thread_message', onThread);
  useSocketEvent('thread_updated', onThread);

  const badgeFor = (item: NavItem) => (item.badge ? badges[item.badge] : 0);
  const mobileMain = nav.length > 5 ? nav.slice(0, 4) : nav;
  const mobileMore = nav.length > 5 ? nav.slice(4) : [];
  const moreBadge = mobileMore.reduce((s, i) => s + badgeFor(i), 0);

  const openNotification = async (n: NotificationRow) => {
    setBellOpen(false);
    if (!n.read) {
      apiSend('PATCH', `/notifications/${n.notificationId}`).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
    }
    if (n.Notification.link) navigate(n.Notification.link);
  };

  const doLogout = () => {
    logout();
    qc.clear();
    navigate('/login', { replace: true });
  };

  const sections: Array<[NavItem['section'], string]> = [
    ['school', session?.school.name ?? 'Escuela'],
    ['courses', 'Cursos SRV'],
    ['admin', 'SRV'],
  ];

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <Link to="/" className="brand">
          <img src={SRV_LOGO} alt="" width={30} height={30} />
          <span>
            Sentryx<span className="accent">.</span>
          </span>
        </Link>
        {sections.map(([key, label]) => {
          const items = nav.filter((i) => i.section === key);
          if (!items.length) return null;
          return (
            <div key={key}>
              <div className="section truncate">{label}</div>
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <item.icon size={19} />
                  {item.label}
                  {badgeFor(item) > 0 && <span className="count">{badgeFor(item)}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div style={{ marginTop: 'auto' }}>
          <NavLink to="/perfil/me" className={({ isActive }) => (isActive ? 'active' : '')}>
            <User size={19} /> Mi perfil
          </NavLink>
          <a href="#" onClick={(e) => (e.preventDefault(), doLogout())}>
            <LogOut size={19} /> Cerrar sesión
          </a>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <img src={SRV_LOGO} alt="" width={26} height={26} className="hide-desktop" />
          {schools.length > 1 ? (
            <button className="topbar-title row" style={{ background: 'none', border: 0, cursor: 'pointer', gap: 4 }} onClick={() => setSchoolOpen(true)}>
              <span className="truncate">{title ?? session?.school.name}</span>
              <ChevronDown size={16} />
            </button>
          ) : (
            <div className="topbar-title">{title ?? session?.school.name ?? 'Sentryx'}</div>
          )}
          <button className="icon-btn" onClick={toggleTheme} aria-label={darkMode ? 'Modo claro' : 'Modo oscuro'}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button className="icon-btn" onClick={() => setBellOpen(true)} aria-label="Notificaciones">
            <Bell size={20} />
            {unreadNotifications > 0 && <span className="dot" style={{ position: 'absolute', top: 9, right: 9 }} />}
          </button>
          <Link to="/perfil/me" className="icon-btn hide-desktop" aria-label="Mi perfil">
            <User size={20} />
          </Link>
        </header>

        <main className="page">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Navegación">
        {mobileMain.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <item.icon size={22} />
            <span className="truncate" style={{ maxWidth: '100%', padding: '0 2px' }}>{item.label}</span>
            {badgeFor(item) > 0 && <span className="dot" />}
          </NavLink>
        ))}
        {mobileMore.length > 0 && (
          <a href="#" onClick={(e) => (e.preventDefault(), setMoreOpen(true))}>
            <MoreHorizontal size={22} />
            <span>Más</span>
            {moreBadge > 0 && <span className="dot" />}
          </a>
        )}
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más opciones">
        <div className="list card" style={{ overflow: 'hidden' }}>
          {mobileMore.map((item) => (
            <Link key={item.to} to={item.to} className="list-item" onClick={() => setMoreOpen(false)}>
              <item.icon size={20} />
              <span className="grow">{item.label}</span>
              {badgeFor(item) > 0 && <span className="count">{badgeFor(item)}</span>}
            </Link>
          ))}
          <a href="#" className="list-item" onClick={(e) => (e.preventDefault(), doLogout())}>
            <LogOut size={20} /> <span className="grow">Cerrar sesión</span>
          </a>
        </div>
      </Sheet>

      <Sheet open={bellOpen} onClose={() => setBellOpen(false)} title="Notificaciones">
        {unreadNotifications > 0 && (
          <button
            className="btn btn-sm btn-ghost"
            style={{ marginBottom: 12 }}
            onClick={() => apiSend('POST', '/notifications/read-all').then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))}
          >
            Marcar todas como leídas
          </button>
        )}
        {notifications.data?.length ? (
          <div className="list card" style={{ overflow: 'hidden' }}>
            {notifications.data.map((n) => (
              <button
                key={n.notificationId}
                className={`list-item ${n.read ? '' : 'unread'}`}
                style={{ background: n.read ? 'transparent' : undefined, border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                onClick={() => openNotification(n)}
              >
                {!n.read && <span className="dot" />}
                <div className="grow">
                  <div className="h3 truncate">{n.Notification.title}</div>
                  <div className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {n.Notification.message}
                  </div>
                </div>
                <span className="xs muted">{timeAgo(n.Notification.createdAt)}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty title="Sin notificaciones" text="Acá vas a ver los avisos de comunicados, mensajes y alertas." icon={<Bell size={36} strokeWidth={1.5} />} />
        )}
      </Sheet>

      <Sheet open={schoolOpen} onClose={() => setSchoolOpen(false)} title="Cambiar de institución">
        <div className="list card" style={{ overflow: 'hidden' }}>
          {schools.map((s) => (
            <button
              key={s.id}
              className="list-item"
              style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', width: '100%' }}
              onClick={() => {
                switchSchool(s.id);
                setSchoolOpen(false);
                navigate('/inicio');
              }}
            >
              <span className="grow h3">{s.name}</span>
              {s.id === session?.school.id && <span className="badge badge-info">Actual</span>}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
};
