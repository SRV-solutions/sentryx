import { env } from './config/env';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { sequelize } from './models';
import { isSocketAuth } from './middlewares/auth';
import { setIO } from './lib/realtime';
import { ensureBaseData } from './utils/seedDataBase';
import { cleanupPendingUploads } from './school/services/files';

const start = async () => {
  await sequelize.authenticate();
  if (env.DB_SYNC === 'true') {
    if (env.isProd) throw new Error('DB_SYNC no está permitido en producción: usá `npm run db:migrate`.');
    // Solo crea tablas faltantes. Nunca borra datos (se eliminó FORCE_SYNC).
    await sequelize.sync();
    console.log('🛠️  Tablas sincronizadas (modo desarrollo)');
  }
  await ensureBaseData();

  const server = http.createServer(app);
  // En producción los sockets viven en su propio proceso (realtime-server.ts); en desarrollo, acá mismo.
  let io: SocketIOServer | null = null;
  if (env.REALTIME_MODE === 'embedded') {
    io = new SocketIOServer(server, {
      cors: { origin: env.corsOrigins, credentials: true },
      pingInterval: 20_000,
      pingTimeout: 20_000,
    });
    io.use(isSocketAuth);
    io.on('connection', (socket) => {
      const user = (socket as typeof socket & { user: { id: number } }).user;
      socket.join(`user_${user.id}`);
    });
    setIO(io);
  }

  // Mantenimiento liviano: borra subidas que nunca se confirmaron (archivos huérfanos en el bucket).
  setInterval(() => cleanupPendingUploads().catch((err) => console.error('[files] cleanup', err)), 3600_000).unref();

  server.listen(env.PORT, () => console.log(`🚀 Sentryx API en puerto ${env.PORT}`));

  const shutdown = () => {
    io?.close();
    server.close(() => sequelize.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch((err) => {
  console.error('❌ No se pudo iniciar el servidor:', err);
  process.exit(1);
});
