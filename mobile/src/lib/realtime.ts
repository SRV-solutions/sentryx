import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { CLIENT_KEY, REALTIME_URL } from '../config';

/**
 * Tiempo real (chat y avisos) SOLO mientras la app está en primer plano: en segundo plano la
 * conexión se cierra para no gastar batería ni datos; de eso se encargan las notificaciones push.
 */
let socket: Socket | null = null;
let currentToken: string | null = null;
const listeners = new Map<string, Set<(payload: unknown) => void>>();

const connect = () => {
  if (!currentToken || socket) return;
  socket = io(REALTIME_URL, {
    auth: { token: currentToken },
    extraHeaders: { 'X-Client-Key': CLIENT_KEY },
    transports: ['websocket'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30_000,
  });
  for (const [event, fns] of listeners) fns.forEach((fn) => socket!.on(event, fn));
};

const disconnect = () => {
  socket?.disconnect();
  socket = null;
};

export const setRealtimeToken = (token: string | null) => {
  if (token === currentToken) return;
  disconnect();
  currentToken = token;
  if (token && AppState.currentState === 'active') connect();
};

AppState.addEventListener('change', (state) => {
  if (state === 'active') connect();
  else disconnect();
});

export const onRealtime = (event: string, fn: (payload: unknown) => void) => {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  socket?.on(event, fn);
  return () => {
    listeners.get(event)?.delete(fn);
    socket?.off(event, fn);
  };
};

export const useRealtimeEvent = <T,>(event: string, handler: (payload: T) => void) => {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onRealtime(event, (p) => ref.current(p as T)), [event]);
};
