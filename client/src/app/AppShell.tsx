import { ReactNode, useCallback, useMemo, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Moon, Sun, MoreHorizontal, LogOut, ChevronDown, Check, Layers, LifeBuoy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSchool } from '../school/SchoolContext';
import { useSocketEvent } from '../context/SocketContext';
import { apiGet, apiSend } from '../lib/api';
import { buildNav, NavItem } from './nav';
import { Sheet, timeAgo, Empty, useToast, Avatar } from '../ui';
import { ReportProblemSheet } from '../school/ReportProblem';
import { GlobalSearch } from './GlobalSearch';

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
  const channels = useQuery({
    queryKey: ['badge', 'channels'],
    queryFn: () => apiGet<{ count: number }>('/school/channels-unread'),
    enabled,
    refetchInterval: 120_000,
  });
  return { announcements: announcements.data?.count ?? 0, threads: threads.data?.count ?? 0, channels: channels.data?.count ?? 0 };
};

export const AppShell = ({ children, title }: { children: ReactNode; title?: string }) => {
  const { logout, isSuperAdmin, user } = useAuth();
  const meName = user ? `${user.userData.firstName} ${user.userData.lastName}` : '?';
  const { darkMode, toggleTheme } = useTheme() as { darkMode: boolean; toggleTheme: () => void };
  const { session, can, schools, switchSchool, levelId, switchLevel } = useSchool();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const nav = useMemo(() => buildNav({ session, can, isSuperAdmin }), [session, can, isSuperAdmin]);
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
  const onChannel = useCallback(() => qc.invalidateQueries({ queryKey: ['badge', 'channels'] }), [qc]);
  useSocketEvent('channel_message', onChannel);

  const badgeFor = (item: NavItem) => (item.badge ? badges[item.badge] : 0);
  const mobileMain = nav.length > 5 ? nav.slice(0, 4) : nav;
  const mobileMore = nav.length > 5 ? nav.slice(4) : [];
  const moreBadge = mobileMore.reduce((s, i) => s + badgeFor(i), 0);
  /**
   * Un ítem se marca activo también en sus subpáginas (Calendario dentro de un acto), salvo que otro ítem
   * del menú cuelgue de su ruta: "Colegios" (/plataforma) no debe quedar marcado en /plataforma/facturacion.
   */
  const exactOnly = (item: NavItem) => nav.some((other) => other.to !== item.to && other.to.startsWith(`${item.to}/`));

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

  const levels = session?.levels ?? [];
  const levelName = levels.find((l) => l.id === levelId)?.name;
  const canSwitch = schools.length > 1 || levels.length > 1;
  const contextLabel = levelName ? `Nivel ${levelName}` : levels.length > 1 ? 'Todos los niveles' : session?.roleLabels.join(' · ');

  /** Escudo del colegio (o iniciales). La marca de la plataforma (SRV) queda siempre visible aparte. */
  const Crest = ({ size = 32 }: { size?: number }) =>
    session?.school.logoUrl ? (
      <img src={session.school.logoUrl} alt="" width={size} height={size} style={{ borderRadius: 8, objectFit: 'contain', background: '#fff', flexShrink: 0 }} />
    ) : (
      <span style={{ width: size, height: size, flexShrink: 0, display: 'inline-flex' }}><Avatar name={session?.school.name ?? '?'} size="sm" /></span>
    );

  const sections: Array<[NavItem['section'], string]> = [
    ['school', session?.school.name ?? 'Escuela'],
    ['platform', 'Plataforma Sentryx'],
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
        {session && (
          <button
            className="card row"
            style={{ padding: 10, margin: '0 0 6px', textAlign: 'left', cursor: canSwitch ? 'pointer' : 'default', width: '100%' }}
            onClick={() => canSwitch && setSchoolOpen(true)}
          >
            <Crest size={36} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="h3" style={{ display: 'block', lineHeight: 1.2 }}>{session.school.name}</span>
              <span className="xs muted truncate" style={{ display: 'block' }}>{contextLabel}</span>
            </span>
            {canSwitch && <ChevronDown size={16} className="muted" />}
          </button>
        )}
        {sections.map(([key, label]) => {
          const items = nav.filter((i) => i.section === key);
          if (!items.length) return null;
          return (
            <div key={key}>
              <div className="section truncate">{label}</div>
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={exactOnly(item)} className={({ isActive }) => (isActive ? 'active' : '')}>
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
            <Avatar name={meName} src={user?.userData.avatar} size="sm" /> <span className="truncate">Mi perfil</span>
          </NavLink>
          <a href="#" onClick={(e) => (e.preventDefault(), setReportOpen(true))}>
            <LifeBuoy size={19} /> Reportar un problema
          </a>
          <a href="#" onClick={(e) => (e.preventDefault(), doLogout())}>
            <LogOut size={19} /> Cerrar sesión
          </a>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          {session ? (
            <button
              className="row grow hide-desktop"
              style={{ background: 'none', border: 0, cursor: canSwitch ? 'pointer' : 'default', gap: 8, minWidth: 0, textAlign: 'left', padding: 0 }}
              onClick={() => canSwitch && setSchoolOpen(true)}
              aria-label="Cambiar colegio o nivel"
            >
              <Crest size={30} />
              <span style={{ minWidth: 0 }}>
                <span className="truncate" style={{ display: 'block', fontWeight: 900, fontSize: 15, lineHeight: 1.15 }}>{title ?? session.school.name}</span>
                <span className="xs muted row" style={{ gap: 2, minWidth: 0 }}><span className="truncate">{contextLabel}</span>{canSwitch && <ChevronDown size={12} style={{ flexShrink: 0 }} />}</span>
              </span>
            </button>
          ) : (
            <img src={SRV_LOGO} alt="" width={26} height={26} className="hide-desktop" />
          )}
          <div className="topbar-title hide-mobile">{title ?? (levelName ? `${session?.school.name} · ${levelName}` : session?.school.name) ?? 'Sentryx'}</div>
          <div className="hide-mobile" style={{ flex: '0 1 420px', minWidth: 0 }}><GlobalSearch /></div>
          <div className="hide-desktop" style={{ flex: '0 1 160px', minWidth: 0 }}><GlobalSearch compact /></div>
          <button className="icon-btn" onClick={toggleTheme} aria-label={darkMode ? 'Modo claro' : 'Modo oscuro'}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button className="icon-btn" onClick={() => setBellOpen(true)} aria-label="Notificaciones">
            <Bell size={20} />
            {unreadNotifications > 0 && <span className="dot" style={{ position: 'absolute', top: 9, right: 9 }} />}
          </button>
          <Link to="/perfil/me" className="icon-btn hide-desktop" aria-label="Mi perfil">
            <Avatar name={meName} src={user?.userData.avatar} size="sm" />
          </Link>
        </header>

        <main className="page">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Navegación">
        {mobileMain.map((item) => (
          <NavLink key={item.to} to={item.to} end={exactOnly(item)} className={({ isActive }) => (isActive ? 'active' : '')}>
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
          <a href="#" className="list-item" onClick={(e) => (e.preventDefault(), setMoreOpen(false), setReportOpen(true))}>
            <LifeBuoy size={20} /> <span className="grow">Reportar un problema</span>
          </a>
          <a href="#" className="list-item" onClick={(e) => (e.preventDefault(), doLogout())}>
            <LogOut size={20} /> <span className="grow">Cerrar sesión</span>
          </a>
        </div>
      </Sheet>

      <ReportProblemSheet open={reportOpen} onClose={() => setReportOpen(false)} />

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

      <Sheet open={schoolOpen} onClose={() => setSchoolOpen(false)} title="Colegio y nivel">
        <div className="stack">
          {levels.length > 1 && (
            <section className="stack" style={{ gap: 8 }}>
              <h3 className="h3 row"><Layers size={16} /> Nivel</h3>
              <div className="card list" style={{ overflow: 'hidden' }}>
                {[{ id: null as number | null, name: 'Todos los niveles' }, ...levels].map((l) => (
                  <button
                    key={l.id ?? 'all'}
                    className="list-item"
                    style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                    onClick={() => {
                      switchLevel(l.id);
                      setSchoolOpen(false);
                      toast(l.id ? `Viendo ${l.name}` : 'Viendo todos los niveles');
                    }}
                  >
                    <span className="grow h3">{l.name}</span>
                    {levelId === l.id && <Check size={18} color="var(--primary)" />}
                  </button>
                ))}
              </div>
            </section>
          )}
          {schools.length > 1 && (
            <section className="stack" style={{ gap: 8 }}>
              <h3 className="h3">Colegio</h3>
              <div className="card list" style={{ overflow: 'hidden' }}>
                {schools.map((sc) => (
                  <button
                    key={sc.id}
                    className="list-item"
                    style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                    onClick={() => {
                      switchSchool(sc.id);
                      setSchoolOpen(false);
                      navigate('/inicio');
                    }}
                  >
                    {sc.logoUrl ? <img src={sc.logoUrl} alt="" width={28} height={28} style={{ borderRadius: 6, objectFit: 'contain', background: '#fff' }} /> : <Avatar name={sc.name} size="sm" />}
                    <span className="grow h3">{sc.name}</span>
                    {sc.id === session?.school.id && <Check size={18} color="var(--primary)" />}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </Sheet>
    </div>
  );
};
