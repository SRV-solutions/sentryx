import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 solicitudes por IP por ventana
  standardHeaders: true, // devuelve información de rate limit en los headers
  legacyHeaders: false, // desactiva los headers `X-RateLimit-*` antiguos
  message: {
    status: 429,
    error: 'Demasiadas solicitudes desde esta IP, intentá de nuevo más tarde.',
  },
});

export default limiter;
