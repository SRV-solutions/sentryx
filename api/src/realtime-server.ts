/**
 * Servidor de tiempo real de Sentryx (chat y avisos instantáneos).
 *
 * Proceso independiente de la API: no usa la base de datos, solo mantiene las conexiones de los
 * celulares/navegadores y entrega lo que la API le pide. Se puede correr en el mismo VPS (otro proceso)
 * o en otro servidor, cambiando REALTIME_URL en la API.
 *
 *   node dist/realtime-server.js          (escucha en REALTIME_PORT, por defecto 3001)
 */
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from './config/env';

if (!env.REALTIME_SECRET) {
  console.error('❌ REALTIME_SECRET es obligatorio para el servidor de tiempo real.');
  process.exit(1);
}

interface EmitBody {
  events: Array<{ userIds: number[]; event: string; payload: unknown }>;
}

const readJson = (req: http.IncomingMessage, limit = 2 * 1024 * 1024) =>
  new Promise<unknown>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload demasiado grande'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, connections: io.engine.clientsCount }));
  }
  if (req.url === '/internal/emit' && req.method === 'POST') {
    if (req.headers['x-realtime-secret'] !== env.REALTIME_SECRET) {
      res.writeHead(401);
      return res.end();
    }
    try {
      const body = (await readJson(req)) as EmitBody;
      for (const e of body.events ?? []) {
        if (!Array.isArray(e.userIds) || typeof e.event !== 'string') continue;
        io.to(e.userIds.map((id) => `user_${Number(id)}`)).emit(e.event, e.payload);
      }
      res.writeHead(204);
      return res.end();
    } catch {
      res.writeHead(400);
      return res.end();
    }
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  cors: { origin: env.corsOrigins, credentials: true },
  // Celulares que cambian de wifi a datos: detectar caídas rápido y reconectar.
  pingInterval: 20_000,
  pingTimeout: 20_000,
  // Si un celular pierde la conexión unos segundos, al volver recupera los eventos que se perdió.
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: true },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No autorizado'));
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as { id: number | string };
    (socket.data as { userId: number }).userId = Number(p.id);
    next();
  } catch {
    next(new Error('Token inválido o expirado'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user_${(socket.data as { userId: number }).userId}`);
});

server.listen(env.REALTIME_PORT, () => console.log(`⚡ Sentryx realtime en puerto ${env.REALTIME_PORT}`));

const shutdown = () => {
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
