import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import './models';

import userRoutes from './routes/userRoutes';
import roleRoutes from './routes/roleRoutes';
import reportRoutes from './routes/reportRoutes';
import chatRoutes from './routes/chatRoutes';
import courseRoutes from './routes/courseRoutes';
import lessonRoutes from './routes/lessonRoutes';
import embeddingRoutes from './routes/embeddingRoutes';
import notificationRoutes from './routes/notificationRoutes';
import friendRoutes from './routes/friendRoutes';
import moduleRoutes from './routes/moduleRoutes';
import schoolRoutes from './school/routes';
import publicRoutes from './school/routes/public';
import { errorHandler } from './lib/http';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// gzip/brotli de respuestas JSON: en celulares con datos móviles reduce ~70% el tamaño.
app.use(compression());
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
    credentials: true,
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-School-Id', 'X-Level-Id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })
);
// Los archivos van directo a S3 con URL firmada: el API solo recibe JSON chico.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Protección contra fuerza bruta en login y recupero de contraseña.
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Demasiados intentos. Probá de nuevo en unos minutos.' } });
app.use(['/users/login', '/users/request-password-reset', '/users/reset-password'], authLimiter);
app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/', (_req, res) => res.send('Sentryx API'));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/public', publicRoutes);
app.use('/school', schoolRoutes);
app.use('/chats', chatRoutes);
app.use('/users', userRoutes);
app.use('/roles', roleRoutes);
app.use('/reports', reportRoutes);
app.use('/courses', courseRoutes);
app.use('/lessons', lessonRoutes);
app.use('/embedding', embeddingRoutes);
app.use('/notifications', notificationRoutes);
app.use('/friends', friendRoutes);
app.use('/modules', moduleRoutes);

app.use((_req, res) => res.status(404).json({ message: 'Ruta inexistente.' }));
app.use(errorHandler);

export default app;
