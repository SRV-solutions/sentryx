import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../lib/api';
import { useAuth } from './AuthContext';

const SocketContext = createContext<Socket | null>(null);

/**
 * Un único socket por sesión (antes se abrían 3 conexiones en paralelo: sidebar, chat y Solvix).
 * Reconecta solo al volver la conexión o al cambiar de wifi a datos.
 */
export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!user?.token) return;
    const s = io(API_URL, { auth: { token: user.token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 10_000 });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [user?.token]);

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
