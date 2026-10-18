import { Router } from 'express';
import * as PushController from '../controllers/push.controller';
import * as PushValidator from '../validators/push.validator';
import { validate } from '../lib/http';

/** Notificaciones push del dispositivo (no dependen del colegio activo). */
const router = Router();

router.get('/push/public-key', PushController.getPublicKey);
router.post('/push/subscribe', validate(PushValidator.subscribe), PushController.subscribe);
router.post('/push/unsubscribe', validate(PushValidator.unsubscribe), PushController.unsubscribe);

export default router;
