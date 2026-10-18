import type { Server } from 'socket.io';
import { env } from '../config/env';

/**
 * Entrega en tiempo real (chat, comunicados, alertas).
 *
 * - embedded: Socket.IO corre dentro de la API (desarrollo / instalaciones chicas).
 * - remote:   Socket.IO corre en su propio proceso o servidor (src/realtime-server.ts). La API le pide
 *             que entregue cada evento por HTTP interno. Reiniciar o actualizar la API no corta los chats.
 *
 * La API siempre guarda primero en la base: si el tiempo real no está disponible no se pierde nada,
 * llega la notificación push y el cliente se pone al día al reconectar.
 */
let io: Server | null = null;

export const setIO = (server: Server) => {
  io = server;
};

interface Pending {
  userIds: number[];
  event: string;
  payload: unknown;
}

// Pequeño buffer: agrupa los eventos de un mismo instante en un solo POST al servidor de tiempo real.
let buffer: Pending[] = [];
let timer: NodeJS.Timeout | null = null;

const flush = async () => {
  timer = null;
  const events = buffer;
  buffer = [];
  if (!events.length) return;
  try {
    const res = await fetch(`${env.REALTIME_URL}/internal/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-realtime-secret': env.REALTIME_SECRET! },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error('[realtime] el servidor respondió', res.status);
  } catch (err) {
    console.error('[realtime] no disponible:', (err as Error).message);
  }
};

export const emitToUsers = (userIds: number[], event: string, payload: unknown) => {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  if (env.REALTIME_MODE === 'embedded') {
    io?.to(ids.map((id) => `user_${id}`)).emit(event, payload);
    return;
  }
  buffer.push({ userIds: ids, event, payload });
  timer ??= setTimeout(flush, 15);
};
