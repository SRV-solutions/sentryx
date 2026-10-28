import { Router } from 'express';
import * as ConductController from '../controllers/conduct.controller';
import * as ConductValidator from '../validators/conduct.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

/** Convivencia del alumno. Sin PATCH ni DELETE a propósito: el historial no se edita ni se borra. */
const router = Router();

router.get('/students/:id/conduct', validate(ConductValidator.listConduct), ConductController.listConduct);
router.post('/students/:id/conduct', authorize(Entity.CONDUCT, Action.CREATE), validate(ConductValidator.createConduct), ConductController.createConduct);

export default router;
