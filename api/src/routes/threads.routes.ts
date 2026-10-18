import { Router } from 'express';
import * as ThreadsController from '../controllers/threads.controller';
import * as ThreadsValidator from '../validators/threads.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.get('/threads/contacts', validate(ThreadsValidator.listContacts), ThreadsController.listContacts);
router.post('/threads', validate(ThreadsValidator.createThread), ThreadsController.createThread);
router.get('/threads', ThreadsController.listThreads);
router.get('/threads/unread-count', ThreadsController.countUnread);
router.get('/threads/:id', validate(ThreadsValidator.getThread), ThreadsController.getThread);
router.post('/threads/:id/messages', validate(ThreadsValidator.postMessage), ThreadsController.postMessage);
router.post('/threads/:id/read', validate(ThreadsValidator.markAsRead), ThreadsController.markAsRead);
router.post('/threads/:id/participants', authorize(Entity.MESSAGES, Action.MANAGE), validate(ThreadsValidator.addParticipant), ThreadsController.addParticipant);
router.post('/threads/:id/:action(close|reopen)', authorize(Entity.MESSAGES, Action.MANAGE), validate(ThreadsValidator.setThreadStatus), ThreadsController.setThreadStatus);

export default router;
