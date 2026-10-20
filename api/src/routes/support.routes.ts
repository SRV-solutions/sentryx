import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as SupportController from '../controllers/support.controller';
import * as SupportValidator from '../validators/support.validator';
import { validate } from '../lib/http';
import { uploadLimiter } from '../middlewares/rateLimits';

/** "Reportar un problema": cualquier usuario con sesión (montado bajo /support con authenticate). */
const router = Router();

/** Máximo 10 reportes por hora por usuario (evita spam). */
const reportLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `support:${req.user?.id}`,
  message: { message: 'Ya enviaste varios reportes. Probá de nuevo en un rato.' },
});

router.get('/config', SupportController.getConfig);
router.post('/attachments/presign', uploadLimiter, validate(SupportValidator.presignAttachment), SupportController.presignAttachment);
router.post('/reports', reportLimiter, validate(SupportValidator.createReport), SupportController.createReport);
router.get('/reports/mine', SupportController.listMyReports);

export default router;
