import express from 'express';
import compression from 'compression';
import './models';
import './lib/validationMessages';
import { apiRouter } from './routes';
import { securityHeaders, corsPolicy, requireTrustedClient } from './middlewares/security';
import { ipLimiter } from './middlewares/rateLimits';
import { errorHandler } from './lib/http';
import { withRequestContext } from './lib/requestContext';
import { activityLogger } from './middlewares/activityLog';

/**
 * Aplicación Express. El orden importa:
 *   headers de seguridad → CORS → límite por IP → solo clientes de confianza → JSON → contexto y
 *   registro de actividad → rutas → errores.
 */
const app = express();

app.set('trust proxy', 1); // detrás de Caddy: la IP real llega en X-Forwarded-For
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(corsPolicy);
app.use(ipLimiter);
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(requireTrustedClient);
// gzip de respuestas JSON: en celulares con datos móviles reduce ~70% el tamaño.
app.use(compression());
// Los archivos van directo al bucket con URL firmada: la API solo recibe JSON chico.
app.use(express.json({ limit: '1mb' }));
// Contexto del pedido (IP, usuario, colegio) para la auditoría y registro de actividad.
app.use(withRequestContext);
app.use(activityLogger);

app.use(apiRouter);

app.use((_req, res) => res.status(404).json({ message: 'Ruta inexistente.' }));
app.use(errorHandler);

export default app;
