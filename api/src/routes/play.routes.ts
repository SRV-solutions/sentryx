import { Router } from 'express';
import * as PlayController from '../controllers/play.controller';
import * as Validator from '../validators/programs.validator';
import { validate } from '../lib/http';
import { joinGameLimiter, playLimiter, playIpLimiter } from '../middlewares/rateLimits';

/** Partidas en vivo: los alumnos juegan sin cuenta (PIN + apodo + token del jugador). */
const router = Router();
router.use(playIpLimiter);

router.post('/join', joinGameLimiter, validate(Validator.joinGame), PlayController.join);
router.get('/state', playLimiter, PlayController.state);
router.post('/answer', playLimiter, validate(Validator.answerQuestion), PlayController.answer);

export default router;
