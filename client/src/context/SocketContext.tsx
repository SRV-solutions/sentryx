import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../lib/api';
import { useAuth } from './AuthContext';

/** Servidor de tiempo real (en producción es un servicio aparte de la API). */
const REALTIME_URL: string = import.meta.env.VITE_REALTIME_URL || API_URL;

const SocketContext = createContext<Socket | null>(null);

/**
 * Un único socket por sesión. Reconecta solo (cambio de wifi a datos, celular bloqueado) y,
 * al reconectar, refresca chats, contadores y notificaciones para no perder nada de lo que llegó mientras tanto.
 */
export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!user?.token) return;
    const s = io(REALTIME_URL, { auth: { token: user.token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 10_000 });
    let wasConnected = false;
    s.on('connect', () => {
      // Si el servidor no pudo recuperar la sesión, puede haber eventos perdidos: se resincroniza.
      if (wasConnected && !s.recovered) {
        ['threads', 'thread', 'badge', 'notifications', 'announcements', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      }
      wasConnected = true;
    });
    // Al volver a la app (desbloquear el celular) se verifica que todo esté al día.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !s.connected) s.connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    setSocket(s);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      s.disconnect();
      setSocket(null);
    };
  }, [user?.token, qc]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);

/** Suscribe un handler a un evento del socket compartido. */
export const useSocketEvent = <T,>(event: string, handler: (payload: T) => void) => {
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [socket, event, handler]);
};
