import openai from '../utils/openai';
import Chat from '../models/Chat';
import ChatMessage from '../models/ChatMessage';
// Controller
import { ChatType } from '../models/enums'

export const chatWithGPT = async (req: any, res: any) => {
    try {
        const { id: userId } = req.user;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'El campo "message" es requerido.' });
        }

        let chat = await Chat.findOne({ where: { userId }, order: [['createdAt', 'DESC']] });

        if (!chat) {
            chat = await Chat.create({ userId });
        }

        // Guarda el mensaje del usuario
        await ChatMessage.create({
            chatId: chat.id,
            senderId: userId,
            isAssistant: false,
            message,
        });


        // const completion = await openai.chat.completions.create({
        //     model: 'gpt-3.5-turbo',
        //     messages: [
        //         { role: 'user', content: message }
        //     ],
        //     max_tokens: 512,
        //     temperature: 0.7
        // });
        // const respuesta = completion.choices[0].message.content;

        const reply = "Respuesta simulada"; // reemplazá con la real

        // const completion = await openai.chat.completions.create(...)

        // Guarda la respuesta de la IA
        await ChatMessage.create({
            chatId: chat.id,
            senderId: null,
            isAssistant: true,
            message: reply,
        });

        res.json({ reply });
    } catch (error) {
        console.error('Error en chatWithGPT:', error);
        res.status(500).json({ error: 'Error al comunicarse con la IA' });
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

        // Verifica que el chat pertenezca al usuario
        const chat = await Chat.findOne({ where: { id: chatId, userId } });
        if (!chat) {
            return res.status(404).json({ error: 'Chat no encontrado o no pertenece al usuario.' });
        }

        // Guarda el mensaje del usuario
        await ChatMessage.create({
            chatId: chat.id,
            senderId: userId,
            isAssistant: false,
            message,
        });

        // Aquí iría la lógica real con OpenAI:
        // const completion = await openai.chat.completions.create(...)
        
        // const completion = await openai.chat.completions.create({
        //     model: 'gpt-3.5-turbo',
        //     messages: [
        //         { role: 'user', content: message }
        //     ],
        //     max_tokens: 512,
        //     temperature: 0.7
        // });
        // const respuesta = completion.choices[0].message.content;
        
        const reply = 'Respuesta simulada desde endpoint por ID';

        // Guarda la respuesta de la IA
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
