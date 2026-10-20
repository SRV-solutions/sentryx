import { env } from './config/env';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { sequelize } from './models';
import { authenticateSocket } from './middlewares/authenticate';
import { isTrustedOrigin, isTrustedClientKey } from './middlewares/security';
import { setIO } from './services/realtime';
import { syncRbacCatalog } from './services/rbac';
import { cleanupPendingUploads } from './services/files';
import { reconcileAllSchools } from './services/billing';
import { sendDueAnnouncements } from './services/announcementDispatch';

const start = async () => {
  await sequelize.authenticate();
  if (env.DB_SYNC === 'true') {
    if (env.isProd) throw new Error('DB_SYNC no está permitido en producción: usá `npm run db:migrate`.');
    // Solo crea tablas faltantes. Nunca borra datos (se eliminó FORCE_SYNC).
    await sequelize.sync();
    console.log('🛠️  Tablas sincronizadas (modo desarrollo)');
  }
  // Roles y permisos: crea en la base los que falten según constants/roles.ts y constants/permissions.ts.
  await syncRbacCatalog();

  const server = http.createServer(app);
  // En producción los sockets viven en su propio proceso (realtime-server.ts); en desarrollo, acá mismo.
  let io: SocketIOServer | null = null;
  if (env.REALTIME_MODE === 'embedded') {
    io = new SocketIOServer(server, {
      cors: { origin: env.corsOrigins, credentials: true },
      // Solo el front (o un cliente registrado) puede abrir el socket.
      allowRequest: (req, callback) => callback(null, isTrustedOrigin(req.headers.origin) || isTrustedClientKey(req.headers['x-client-key'])),
      pingInterval: 20_000,
      pingTimeout: 20_000,
    });
    io.use(authenticateSocket);
    io.on('connection', (socket) => {
      const user = (socket as typeof socket & { user: { id: number } }).user;
      socket.join(`user_${user.id}`);
    });
    setIO(io);
  }

  // Mantenimiento liviano: borra subidas que nunca se confirmaron (archivos huérfanos en el bucket).
  setInterval(() => cleanupPendingUploads().catch((err) => console.error('[files] cleanup', err)), 3600_000).unref();
  // Red de seguridad de facturación: sincroniza los períodos de acceso aunque algún cambio no lo haya hecho.
  setInterval(() => reconcileAllSchools().catch((err) => console.error('[billing] reconcile', err)), 3600_000).unref();
  // Comunicados programados: se envían solos cuando llega su hora.
  setInterval(() => sendDueAnnouncements().catch((err) => console.error('[announcements] scheduled', err)), 60_000).unref();

  server.listen(env.PORT, env.HOST, () => console.log(`🚀 Sentryx API en ${env.HOST}:${env.PORT}`));

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
