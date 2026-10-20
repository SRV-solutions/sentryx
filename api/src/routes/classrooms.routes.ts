import { Router } from 'express';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';
import * as ClassroomsController from '../controllers/classrooms.controller';
import * as ClassroomsValidator from '../validators/classrooms.validator';
import { validate } from '../lib/http';

const router = Router();

router.get('/classrooms', ClassroomsController.listClassrooms);
router.get('/classrooms/agenda', validate(ClassroomsValidator.agenda), ClassroomsController.getAgenda);
router.get('/classrooms/:id', validate(ClassroomsValidator.getClassroom), ClassroomsController.getClassroom);
router.get('/classrooms/:id/posts', validate(ClassroomsValidator.listPosts), ClassroomsController.listPosts);
router.post('/classrooms/:id/posts', authorize(Entity.CLASSROOM_POSTS, Action.CREATE), validate(ClassroomsValidator.createPost), ClassroomsController.createPost);
router.patch('/classroom-posts/:id', authorize(Entity.CLASSROOM_POSTS, Action.UPDATE), validate(ClassroomsValidator.updatePost), ClassroomsController.updatePost);
router.delete('/classroom-posts/:id', authorize(Entity.CLASSROOM_POSTS, Action.UPDATE), validate(ClassroomsValidator.deletePost), ClassroomsController.deletePost);
router.get('/classrooms/:id/announcements', validate(ClassroomsValidator.listClassroomAnnouncements), ClassroomsController.listClassroomAnnouncements);

export default router;
