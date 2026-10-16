import type { Server } from 'socket.io';

let io: Server | null = null;

export const setIO = (server: Server) => {
  io = server;
};

/** Usuarios con al menos un socket abierto (para decidir si hace falta push/email). */
export const onlineUserIds = async (userIds: number[]): Promise<Set<number>> => {
  if (!io || !userIds.length) return new Set();
  const online = new Set<number>();
  for (const id of userIds) {
    if ((io.sockets.adapter.rooms.get(`user_${id}`)?.size ?? 0) > 0) online.add(id);
  }
  return online;
};

export const emitToUsers = (userIds: number[], event: string, payload: unknown) => {
  if (!io || !userIds.length) return;
  io.to(userIds.map((id) => `user_${id}`)).emit(event, payload);
};
