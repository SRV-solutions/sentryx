import { Router } from 'express';
import * as AnnouncementsController from '../controllers/announcements.controller';
import * as AnnouncementsValidator from '../validators/announcements.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.get('/announcements/audiences', authorize(Entity.ANNOUNCEMENTS, Action.CREATE), AnnouncementsController.listAudiences);
router.get('/announcements/families', authorize(Entity.ANNOUNCEMENTS, Action.CREATE), validate(AnnouncementsValidator.listFamilies), AnnouncementsController.listFamilies);
router.post('/announcements', authorize(Entity.ANNOUNCEMENTS, Action.CREATE), validate(AnnouncementsValidator.createAnnouncement), AnnouncementsController.createAnnouncement);
router.get('/announcements', validate(AnnouncementsValidator.listAnnouncements), AnnouncementsController.listAnnouncements);
router.get('/announcements/unread-count', AnnouncementsController.countUnread);
router.get('/announcements/:id', validate(AnnouncementsValidator.getAnnouncement), AnnouncementsController.getAnnouncement);
router.put('/announcements/:id', authorize(Entity.ANNOUNCEMENTS, Action.CREATE), validate(AnnouncementsValidator.updateAnnouncement), AnnouncementsController.updateAnnouncement);
router.delete('/announcements/:id', authorize(Entity.ANNOUNCEMENTS, Action.CREATE), validate(AnnouncementsValidator.byId), AnnouncementsController.deleteAnnouncement);
router.post('/announcements/:id/send', authorize(Entity.ANNOUNCEMENTS, Action.CREATE), validate(AnnouncementsValidator.byId), AnnouncementsController.sendAnnouncement);
router.post('/announcements/:id/archive', authorize(Entity.ANNOUNCEMENTS, Action.CREATE), validate(AnnouncementsValidator.byId), AnnouncementsController.archiveAnnouncement);
router.post('/announcements/:id/unarchive', authorize(Entity.ANNOUNCEMENTS, Action.CREATE), validate(AnnouncementsValidator.byId), AnnouncementsController.archiveAnnouncement);
router.post('/announcements/:id/ack', validate(AnnouncementsValidator.acknowledge), AnnouncementsController.acknowledge);
router.get('/announcements/:id/recipients', validate(AnnouncementsValidator.listRecipients), AnnouncementsController.listRecipients);
router.post('/announcements/:id/remind', authorize(Entity.ANNOUNCEMENTS, Action.CREATE), validate(AnnouncementsValidator.remindPending), AnnouncementsController.remindPending);

export default router;
