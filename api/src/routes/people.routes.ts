import { Router } from 'express';
import * as PeopleController from '../controllers/people.controller';
import * as PeopleValidator from '../validators/people.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.get('/people', authorize(Entity.USERS, Action.READ), validate(PeopleValidator.listPeople), PeopleController.listPeople);
router.get('/people/:id', validate(PeopleValidator.getPerson), PeopleController.getPerson);
router.patch('/people/:id', authorize(Entity.USERS, Action.UPDATE), validate(PeopleValidator.updatePerson), PeopleController.updatePerson);
router.post('/people/:id/reset-password', authorize(Entity.USERS, Action.UPDATE), validate(PeopleValidator.resetPassword), PeopleController.resetPassword);
router.patch('/people/:id/access', authorize(Entity.USERS, Action.UPDATE), validate(PeopleValidator.setAccess), PeopleController.setAccess);

export default router;
