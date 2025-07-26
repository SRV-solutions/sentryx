import openai from '../utils/openai';
import Chat from '../models/Chat';
import ChatMessage from '../models/ChatMessage';
import ChatUser from '../models/ChatUser';

import pgvector from 'pgvector/pg';
import { pool } from '../embedding/pgClient'
import { ChatType } from '../models/enums'
import User from '../models/User';
import { Op } from 'sequelize';
import Friendship from '../models/Friendship';


export const getUnreadCounts = async (req: any, res: any) => {
    try {
        const userId = req.user.id;

        // Obtener todos los chats del usuario
        const chatUsers = await ChatUser.findAll({ where: { userId } });

        // Armar array con chatId y lastReadMessageId
        const unreadCounts: { [chatId: number]: number } = {};

        for (const cu of chatUsers) {
            const { chatId, lastReadMessageId } = cu;

            const whereClause: any = {
                chatId,
                senderId: { [Op.ne]: userId }, // mensajes que no son del usuario
            };

            if (lastReadMessageId) {
                whereClause.id = { [Op.gt]: lastReadMessageId };
            }

            const count = await ChatMessage.count({ where: whereClause });
            unreadCounts[chatId] = count;
        }

        return res.json(unreadCounts);
    } catch (error) {
        console.error('Error en getUnreadCounts:', error);
        res.status(500).json({ error: 'No se pudieron obtener los mensajes no leídos.' });
    }
};


export const chatWithGPTInChat = async (req: any, res: any) => {
    try {
        const { id: userId } = req.user;
        const { chatId } = req.params;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'El campo "message" es requerido.' });
        }

        // Verificar que el usuario es parte del chat
        const chatUser = await ChatUser.findOne({ where: { chatId, userId } });
        if (!chatUser) {
            return res.status(400).json({ error: 'No tenés acceso a este chat.' });
        }

        const chat = await Chat.findByPk(chatId);
        if (!chat || chat.type !== ChatType.AI) {
            return res.status(404).json({ error: 'Chat no encontrado o no es de tipo AI.' });
        }

        // Guardar mensaje del usuario
        await ChatMessage.create({
            chatId,
            senderId: userId,
            isAssistant: false,
            message,
        });

        // Obtener embedding
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: message,
        });

        const embedding = pgvector.toSql(embeddingResponse.data[0].embedding);

        const { rows } = await pool.query(`
            SELECT content
            FROM documents
            ORDER BY embedding <-> $1
            LIMIT 5
        `, [embedding]);

        const context = rows.map(r => r.content).join('\n');

        // Generar respuesta IA
        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: 'Respondé como un experto de SRV, usando solo información relevante del contexto.' },
                { role: 'user', content: `Contexto:\n${context}\n\nPregunta:\n${message}` },
            ],
            max_tokens: 512,
            temperature: 0.7,
        });

        const reply = completion.choices[0].message.content;

        // Guardar respuesta de IA
        await ChatMessage.create({
            chatId,
            senderId: null,
            isAssistant: true,
            message: reply,
        });

        res.json({ reply });
    } catch (error) {
        console.error('Error en chatWithGPTInChat:', error);
        res.status(500).json({ error: 'Error al comunicarse con la IA' });
    }
};


export const getChatMessages = async (req: any, res: any) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;

        // Verificar que el usuario pertenece al chat
        const chatUser = await ChatUser.findOne({ where: { chatId, userId } });

        if (!chatUser) {
            return res.status(400).json({ error: 'No tienes acceso a este chat.' });
        }

        const messages = await ChatMessage.findAll({
            where: { chatId },
            include: [{
                model: User,
                as: 'sender',
                attributes: ['id', 'firstName', 'lastName', 'avatar', 'email', 'username'],
            }, {
                model: Chat
            }],
            order: [['createdAt', 'ASC']],
        });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener mensajes.' });
    }
};

export const getOrCreateAIChat = async (req: any, res: any) => {
    const userId = req.user.id;
    try {
        // 1. Buscar si ya existe un chat AI donde el usuario es parte
        const chats = await Chat.findAll({
            where: { type: ChatType.AI },
            include: [{
                model: ChatUser,
                where: { userId: userId }
            }]
        });

        let chat = chats[0];

        // 2. Si no existe, crearlo
        if (!chat) {
            chat = await Chat.create({
                title: 'Chat con Solvix',
                type: ChatType.AI,
            });

            await ChatUser.create({
                chatId: chat.id,
                userId,
                isAdmin: true,
            });
        }

        res.json({ chatId: chat.id });
    } catch (error) {
        console.error('Error en getOrCreateAIChat:', error);
        res.status(500).json({ error: 'Error al obtener o crear el chat con la IA.' });
    }
};

export const createOrGetPrivateChat = async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { friendId } = req.body;

        if (userId === friendId) {
            return res.status(400).json({ error: 'No te podés crear un chat contigo mismo.' });
        }

        // Buscar chat privado que incluya solo a esos dos usuarios
        const chats = await Chat.findAll({
            where: { type: 'PRIVATE' },
            include: [
                {
                    model: User,
                    as: 'Users',
                    where: { id: [userId, friendId] },
                    through: { attributes: [] },
                },
            ],
        });

        // Filtrar chats que tienen exactamente esos dos usuarios (y no más)
        const chat = chats.find(c => c.Users.length === 2);

        if (chat) {
            return res.json(chat);
        }

        // Si no existe, crear nuevo chat
        const newChat = await Chat.create({
            title: `Chat privado`,
            type: 'PRIVATE',
        });

        // Agregar usuarios a ChatUser
        await ChatUser.bulkCreate([
            { chatId: newChat.id, userId, isAdmin: true },
            { chatId: newChat.id, userId: friendId, isAdmin: false },
        ]);

        const chatWithUsers = await Chat.findByPk(newChat.id, { include: { model: User, as: 'Users' } });

        res.json(chatWithUsers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo crear o obtener el chat.' });
    }
};

export const sendMessageToChat = async (req: any, res: any) => {
    try {

        const senderId = req.user.id;
        const { chatId } = req.params;
        const { message } = req.body;

        // Validar que el usuario pertenece al chat
        const chatUser = await ChatUser.findOne({ where: { chatId, userId: senderId }, include: [Chat] });
        if (!chatUser) {
            return res.status(400).json({ error: 'No perteneces a este chat.' });
        }

        if (chatUser.Chat.type === ChatType.PRIVATE) {
            // Obtener el otro usuario del chat
            const otherUser = await ChatUser.findOne({
                where: {
                    chatId,
                    userId: { [Op.not]: senderId },
                },
            });

            if (!otherUser) {
                return res.status(400).json({ error: 'El otro usuario no existe en el chat.' });
            }

            const otherUserId = otherUser.userId;

            // Verificar si existe una relación de amistad aceptada en ambas direcciones
            const friendship = await Friendship.findOne({
                where: {
                    [Op.or]: [
                        { requesterId: senderId, receiverId: otherUserId },
                        { requesterId: otherUserId, receiverId: senderId },
                    ],
                    status: 'accepted',
                },
            });

            if (!friendship) {
                return res.status(403).json({ error: 'No puedes enviar mensajes si no son amigos.' });
            }
        }
        // Guardar el mensaje
        const msg = await ChatMessage.create({
            chatId,
            senderId,
            isAssistant: false,
            message,
        });

        // Obtener los participantes del chat
        const participants = await ChatUser.findAll({ where: { chatId } });

        // Emitir mensaje por socket a todos los usuarios del chat
        const io = req.app.get('io');
        participants.forEach(participant => {
            io.to(`user_${participant.userId}`).emit('new_message', {
                chatId,
                message: {
                    id: msg.id,
                    senderId: msg.senderId,
                    content: msg.message,
                    createdAt: msg.createdAt,
                }
            });
        });

        res.json(msg);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo enviar el mensaje.' });
    }
};


export const getMessagesFromChat = async (req: any, res: any) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;

        // Verificar que el usuario pertenece al chat
        const chatUser = await ChatUser.findOne({ where: { chatId, userId } });
        if (!chatUser) {
            return res.status(400).json({ error: 'No tienes acceso a este chat.' });
        }

        const messages = await ChatMessage.findAll({
            where: { chatId },
            order: [['createdAt', 'ASC']],
        });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener mensajes.' });
    }
};

export const getUserChats = async (req: any, res: any) => {
    try {
        const userId = req.user.id;

        const chats = await Chat.findAll({
            include: [
                {
                    model: ChatUser,
                    where: { userId },
                    include: [
                        {
                            model: User,
                            attributes: ['id', 'firstName', 'lastName', 'avatar', 'email', 'username'],
                        },
                    ],
                },
                {
                    model: ChatMessage,
                    limit: 1, // Podés traer el último mensaje si querés
                    order: [['createdAt', 'DESC']],
                },
                {
                    model: User,
                    through: { attributes: [] }, // Evita que aparezca ChatUser
                    attributes: ['id', 'firstName', 'lastName', 'avatar', 'email', 'username'],
                },
            ],
            order: [['updatedAt', 'DESC']],
        });

        const privateChats = chats.filter(chat => chat.type === 'PRIVATE');
        const groupChats = chats.filter(chat => chat.type === 'GROUP');
        const aiChats = chats.filter(chat => chat.type === 'AI');

        res.json({
            private: privateChats,
            group: groupChats,
            ai: aiChats,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener los chats del usuario.' });
    }
};

export const markChatAsRead = async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { chatId } = req.params;

        // 1) Obtener el ID del último mensaje de ese chat
        const lastMsg = await ChatMessage.findOne({
            where: { chatId },
            order: [['id', 'DESC']],
            attributes: ['id'],
        });

        if (!lastMsg) return res.status(404).json({ error: 'No hay mensajes' });

        // 2) Actualizar ChatUser.lastReadMessageId
        await ChatUser.update(
            { lastReadMessageId: lastMsg.id },
            { where: { chatId, userId } }
        );

        return res.json({ success: true, lastReadMessageId: lastMsg.id });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'No se pudo marcar como leído' });
    }
};