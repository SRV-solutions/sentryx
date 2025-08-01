import { Router } from 'express';
import {
    getChatMessages,
    getOrCreateAIChat,
    chatWithGPTInChat,
    createOrGetPrivateChat,
    sendMessageToChat,
    getUserChats,
    markChatAsRead,
    getUnreadCounts,
    // deleteChat, // si querés agregar deleteChat después
} from '../controllers/chatController';
import { isAuth, checkPermission } from '../middlewares/auth';
import { Action, Entity } from '../models/enums';

const router = Router();

// --- Chat con IA ---
router.get('/my-ai-chat', isAuth, checkPermission(Entity.CHATS, Action.CREATE), getOrCreateAIChat);
router.post('/:chatId/messages/ai', isAuth, checkPermission(Entity.CHATS, Action.CREATE), chatWithGPTInChat);
router.get('/:chatId/messages', isAuth, checkPermission(Entity.CHATS, Action.READ), getChatMessages);

// --- Chat entre usuarios ---
// Crear o obtener chat privado entre dos usuarios
router.post('/private', isAuth, checkPermission(Entity.CHATS, Action.CREATE), createOrGetPrivateChat);
router.post('/:chatId/messages', isAuth, checkPermission(Entity.CHATS, Action.CREATE), sendMessageToChat);
router.get('/', isAuth, checkPermission(Entity.CHATS, Action.READ), getUserChats);
// Marcar todos los mensajes hasta el último como leídos por este usuario
router.post('/:chatId/read', isAuth, checkPermission(Entity.CHATS, Action.READ), markChatAsRead);
router.get('/unread-counts', isAuth, checkPermission(Entity.CHATS, Action.READ), getUnreadCounts);



export default router;