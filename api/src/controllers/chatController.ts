import openai from '../utils/openai';
import Chat from '../models/Chat';
import ChatMessage from '../models/ChatMessage';
import pgvector from 'pgvector/pg';
import { pool } from '../embedding/pgClient'

import { ChatType } from '../models/enums'


export const chatWithGPTInChat = async (req: any, res: any) => {
    try {
        const { id: userId } = req.user;
        const { chatId } = req.params;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'El campo "message" es requerido.' });
        }

        const chat = await Chat.findOne({ where: { id: chatId, userId } });
        if (!chat) {
            return res.status(404).json({ error: 'Chat no encontrado o no pertenece al usuario.' });
        }

        await ChatMessage.create({
            chatId: chat.id,
            senderId: userId,
            isAssistant: false,
            message,
        });

        // 1. Obtener el embedding del mensaje
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: message,
        });
        const embedding = pgvector.toSql(embeddingResponse.data[0].embedding);

        // 2. Buscar los documentos más cercanos
        const { rows } = await pool.query(
            `SELECT content
             FROM documents
             ORDER BY embedding <-> $1
             LIMIT 5`,
            [embedding]
        );

        const context = rows.map(r => r.content).join('\n');

        // 3. Enviar el mensaje con contexto a OpenAI
        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: 'Respondé como si fueras un experto de SRV, usando solo información relevante de contexto.' },
                { role: 'user', content: `Contexto:\n${context}\n\nPregunta:\n${message}` },
            ],
            max_tokens: 512,
            temperature: 0.7,
        });

        const reply = completion.choices[0].message.content;

        // 4. Guardar respuesta
        await ChatMessage.create({
            chatId: chat.id,
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

        // Verificar que el chat pertenece al usuario
        const chat = await Chat.findOne({ where: { id: chatId, userId } });

        if (!chat) {
            return res.status(403).json({ error: 'No tienes acceso a este chat.' });
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

export const getOrCreateAIChat = async (req: any, res: any) => {
    const userId = req.user.id;
    try {
        let chat = await Chat.findOne({
            where: {
                userId,
                type: ChatType.AI, // asumimos que el tipo de chat es 'AI'
            },
        });

        if (!chat) {
            chat = await Chat.create({
                userId,
                title: 'Chat con Solvix',
                type: ChatType.AI,
            });
        }

        res.json({ chatId: chat.id });

    } catch (error) {
        console.error('Error en getOrCreateAIChat:', error);
        res.status(500).json({ error: 'Error al obtener o crear el chat con la IA.' });
    }
};


export const createUserChat = async (req: any, res: any) => {
    try {
        const { userId } = req.user;
        const { friendId } = req.body;

        const chat = await Chat.create({ userId }); // opcional: usar un `ChatUser` si querés que sea de 2

        res.json(chat);
    } catch (error) {
        res.status(500).json({ error: 'No se pudo crear el chat.' });
    }
};

export const sendMessageToUser = async (req: any, res: any) => {
    try {
        const { id: senderId } = req.user;
        const { chatId } = req.params;
        const { message } = req.body;

        const msg = await ChatMessage.create({
            chatId,
            senderId,
            isAssistant: false,
            message,
        });

        res.json(msg);
    } catch (error) {
        res.status(500).json({ error: 'No se pudo enviar el mensaje.' });
    }
};
