import { Router } from 'express';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';
import * as ChannelsController from '../controllers/channels.controller';
import * as ChannelsValidator from '../validators/channels.validator';
import { validate } from '../lib/http';

const router = Router();

router.get('/channels', ChannelsController.listChannels);
router.get('/channels/:id', validate(ChannelsValidator.getChannel), ChannelsController.getChannel);
router.get('/channels/:id/members', validate(ChannelsValidator.listMembers), ChannelsController.listMembers);
router.post('/channels/:id/messages', validate(ChannelsValidator.postMessage), ChannelsController.postMessage);
router.post('/channels/:id/read', validate(ChannelsValidator.markAsRead), ChannelsController.markAsRead);
router.post('/channel-messages/:id/:action(hide|unhide)', authorize(Entity.CHANNELS, Action.MODERATE), validate(ChannelsValidator.setMessageVisibility), ChannelsController.setMessageVisibility);
router.post('/channels/:id/mute', authorize(Entity.CHANNELS, Action.MODERATE), validate(ChannelsValidator.muteStudent), ChannelsController.muteStudent);
router.delete('/channels/:id/mute/:userId', authorize(Entity.CHANNELS, Action.MODERATE), validate(ChannelsValidator.unmuteStudent), ChannelsController.unmuteStudent);
router.get('/channels-unread', ChannelsController.countUnread);

export default router;
