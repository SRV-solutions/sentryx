import { Router } from 'express';
import {
    chatWithGPT,
    //   startChat,
    //   sendMessage,
    //   getUserChats,
    getChatMessages,
    getOrCreateAIChat,
    chatWithGPTInChat
    //   deleteChat
} from '../controllers/chatController';
import { isAuth, checkPermission } from '../middlewares/auth';
import { Action, Entity } from '../models/enums';

const router = Router();

// Chat con IA
router.get('/my-ai-chat', isAuth, checkPermission(Entity.CHATS, Action.CREATE), getOrCreateAIChat);
router.post('/:chatId/messages/ai', isAuth, checkPermission(Entity.CHATS, Action.CREATE), chatWithGPTInChat);
router.get('/:chatId/messages', isAuth, checkPermission(Entity.CHATS, Action.READ), getChatMessages);

// router.post('/ai', isAuth, checkPermission(Entity.CHATS, Action.CREATE), chatWithGPT);
// Chat entre usuarios
// router.post(
//   '/chat/start',
//   isAuth,
//   checkPermission(Entity.CHATS, Action.CREATE),
//   startChat
// );

// router.post(
//   '/chat/:chatId/message',
//   isAuth,
//   checkPermission(Entity.CHATS, Action.CREATE),
//   sendMessage
// );

// router.get(
//   '/chat',
//   isAuth,
//   checkPermission(Entity.CHATS, Action.READ),
//   getUserChats
// );


// router.delete(
//   '/chat/:chatId',
//   isAuth,
//   checkPermission(Entity.CHATS, Action.DELETE),
//   deleteChat
// );

export default router;
