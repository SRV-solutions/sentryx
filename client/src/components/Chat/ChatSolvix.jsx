import { useState, useEffect } from 'react';
import { useRef } from 'react';
import io from 'socket.io-client';


import ChatSidebar from './ChatSidebar';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import {
    Box,
    CircularProgress,

} from '@mui/material';


import styles from './ChatSolvix.module.css';

import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNavigate, useParams } from 'react-router-dom';

const apiUrl = import.meta.env.VITE_API_URL;

const ChatSolvix = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [messages, setMessages] = useState([]);
    const [isTyping, setIsTyping] = useState(false);
    const socketRef = useRef(null);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const { authFetch, user } = useAuth();
    const { darkMode } = useTheme();
    const [chats, setChats] = useState([]); // [{id, name, avatar, isAI}]
    const [activeChat, setActiveChat] = useState(id); // chatId
    const [search, setSearch] = useState('');
    const { unreadCounts, setUnreadCounts } = useChat();

    useEffect(() => {
        if (!activeChat) return;
        const loadMessages = async () => {
            const res = await authFetch(`${apiUrl}/chats/${activeChat}/messages`);
            const data = await res.json();
            setMessages(data);
        };
        setUnreadCounts(prev => {
            const newCounts = { ...prev };
            delete newCounts[activeChat];
            return newCounts;
        });

        loadMessages();
    }, [activeChat]);


    const markMessagesAsRead = async (chatId) => {
        try {
            await authFetch(`${apiUrl}/chats/${chatId}/read`, {
                method: 'POST',
            });
        } catch (err) {
            console.error('Error al marcar como leído', err);
        }
    };

    useEffect(() => {
        setActiveChat(id)
        navigate(`/chat/${id}`)
        const fetchChats = async () => {
            const userChatsRes = await authFetch(`${apiUrl}/chats`);
            const userChats = await userChatsRes.json();
            // Aplanamos y marcamos el tipo de chat
            const allChats = [
                ...userChats.private.map(c => ({ ...c, isAI: false, chatType: 'private' })),
                ...userChats.group.map(c => ({ ...c, isAI: false, chatType: 'group' })),
                ...userChats.ai.map(c => ({ ...c, isAI: true, chatType: 'ai' })),
            ];

            setChats(allChats);
            const aiChat = allChats.find(c => c.chatType === 'ai');
            if (aiChat && !id) {
                setActiveChat(aiChat.id);
            }
        };


        fetchChats();
        fetchUnreadCounts();
    }, []);

    useEffect(() => {
        if (!user) return;

        socketRef.current = io(import.meta.env.VITE_API_URL, {
            query: { userId: user.userData.id },
            auth: { token: user.token },
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, [user]);


    useEffect(() => {
        if (!chats || !user || !Number(activeChat)) return;

        const chat = chats.find(c => c.id === Number(activeChat));
        if (!chat) return;

        const handleNewMessage = (data) => {
            const sender = chat.Users?.find(u => u.id === data.message.senderId);

            if (Number(data.chatId) === Number(activeChat)) {
                setMessages(prev => [
                    ...prev,
                    {
                        sender: { username: sender?.username || 'Usuario' },
                        Chat: { type: chat.type },
                        senderId: data.message.senderId,
                        message: data.message.content,
                        createdAt: data.message.createdAt,
                    },
                ]);
            } else {
                setUnreadCounts(prev => ({
                    ...prev,
                    [data.chatId]: (prev[data.chatId] || 0) + 1,
                }));
            }
        };
        socketRef.current.on('new_message', handleNewMessage);
        return () => {
            socketRef.current?.off('new_message', handleNewMessage);
        };
    }, [activeChat, chats]);


    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || !activeChat) return;
        const chat = chats.find(c => c.id === Number(activeChat));

        const endpoint = chat.type === 'AI'
            ? `${apiUrl}/chats/${activeChat}/messages/ai`
            : `${apiUrl}/chats/${activeChat}/messages`;

        const messageToSend = input.trim();
        setInput('');
        setLoading(true);

        try {
            await authFetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: messageToSend }),
            });

            // 🎯 El mensaje lo recibís del socket automáticamente, no hay que hacer nada acá
        } catch (err) {
            console.error('Error al enviar mensaje', err);
            // opcional: mostrar un toast
        } finally {
            setLoading(false);
        }
    };


    const handleKeyDown = e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
    const handleChatClick = async (chatId) => {
        setActiveChat(chatId);
        navigate(`/chat/${chatId}`)


        // 🧼 Limpiar contador global
        setUnreadCounts(prev => {
            const updated = { ...prev };
            delete updated[chatId];
            return updated;
        });


        await markMessagesAsRead(chatId);
    };


    const fetchUnreadCounts = async () => {
        const res = await authFetch(`${apiUrl}/chats/unread-counts`);
        const counts = await res.json();
        setUnreadCounts(counts);
    };

    if (!chats.length || !activeChat || !chats.find(c => c.id === Number(activeChat))) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
                <CircularProgress />
            </Box>
        );
    }
    return (
        <Box className={styles.chatContainer}>
            <ChatSidebar
                chats={chats}
                activeChat={activeChat}
                handleChatClick={handleChatClick}
                notificationMessages={unreadCounts}
                search={search}
                setSearch={setSearch}
                user={user}
            />
            <Box
                className={`${styles.chatMain} ${darkMode ? styles.darkChatMain : ''}`}
                sx={{
                    bgcolor: darkMode ? '#121212' : '#fff',
                    color: darkMode ? '#f1f1f1' : '#000',
                }}
            >
                <ChatMessages
                    messages={messages}
                    isTyping={isTyping}
                    user={user}
                    darkMode={darkMode}
                    messagesEndRef={messagesEndRef}
                />
                <ChatInput
                    input={input}
                    setInput={setInput}
                    sendMessage={sendMessage}
                    handleKeyDown={handleKeyDown}
                    loading={loading}
                    darkMode={darkMode}
                />
            </Box>
        </Box>
    );
};


const Dot = ({ delay = '0s' }) => (
    <Box
        component="span"
        sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#999',
            animation: 'dotPulse 1s infinite',
            animationDelay: delay,
            '@keyframes dotPulse': {
                '0%': { transform: 'scale(1)', opacity: 1 },
                '50%': { transform: 'scale(1.5)', opacity: 0.6 },
                '100%': { transform: 'scale(1)', opacity: 1 },
            },
        }}
    />
);

export default ChatSolvix;
