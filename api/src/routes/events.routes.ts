import { Router } from 'express';
import * as EventsController from '../controllers/events.controller';
import * as Validator from '../validators/events.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { requireFeature } from '../middlewares/requireFeature';
import { Entity, Action } from '../constants/permissions';
import { PlanFeature } from '../constants/plans';

/**
 * Calendario institucional (plan Integral). Familias y estudiantes con ese plan ven los eventos de la
 * comunidad de sus cursos; el personal ve todos y, según su rol, los crea, edita o trabaja como encargado.
 */
const router = Router();
const events = requireFeature(PlanFeature.EVENTS);

router.get('/events', events, validate(Validator.listEvents), EventsController.listEvents);
router.get('/events/mine', events, EventsController.listMyEvents);
router.get('/events/holidays', authorize(Entity.EVENTS, Action.CREATE), events, validate(Validator.listHolidays), EventsController.listHolidays);
router.post('/events/holidays', authorize(Entity.EVENTS, Action.CREATE), events, validate(Validator.importHolidays), EventsController.importHolidays);
router.get('/events/:id', events, validate(Validator.eventId), EventsController.getEvent);
router.post('/events', authorize(Entity.EVENTS, Action.CREATE), events, validate(Validator.createEvent), EventsController.createEvent);
router.patch('/events/:id', authorize(Entity.EVENTS, Action.UPDATE), events, validate(Validator.updateEvent), EventsController.updateEvent);
router.delete('/events/:id', authorize(Entity.EVENTS, Action.DELETE), events, validate(Validator.eventId), EventsController.deleteEvent);
router.put('/events/:id/managers', authorize(Entity.EVENTS, Action.UPDATE), events, validate(Validator.setManagers), EventsController.setManagers);

// Espacio de trabajo del acto: encargados (el controlador lo verifica) y quien edita eventos.
router.post('/events/:id/posts', authorize(Entity.EVENTS, Action.READ), events, validate(Validator.createPost), EventsController.createPost);
router.patch('/event-posts/:id', authorize(Entity.EVENTS, Action.READ), events, validate(Validator.updatePost), EventsController.updatePost);
router.delete('/event-posts/:id', authorize(Entity.EVENTS, Action.READ), events, validate(Validator.postId), EventsController.deletePost);

export default router;
