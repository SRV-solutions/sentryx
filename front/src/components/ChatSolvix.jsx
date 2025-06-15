import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    Box,
    TextField,
    Button,
    Avatar,
    Typography,
    Divider,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Paper,
} from '@mui/material';
import styles from './ChatSolvix.module.css';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const apiUrl = import.meta.env.VITE_API_URL;

const ChatSolvixComponent = () => {
    const [messages, setMessages] = useState([
        { sender: 'Solvix', text: 'Hola 👋 ¿En qué puedo ayudarte hoy?' }
    ]);

    const [chatId, setChatId] = useState(null);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const { authFetch } = useAuth();
    const { darkMode } = useTheme();

    useEffect(() => {
        const initChat = async () => {
            try {
                const res = await authFetch(`${apiUrl}/chats/my-ai-chat`);
                const data = await res.json();
                
                setChatId(data.chatId);

                const messagesRes = await authFetch(`${apiUrl}/chats/${data.chatId}/messages`);
                const msgs = await messagesRes.json();
                const parsedMessages = msgs.map(m => ({
                    sender: m.isAssistant ? 'Solvix' : 'Tú',
                    text: m.message
                }));
                setMessages([{ sender: 'Solvix', text: 'Hola 👋 ¿En qué puedo ayudarte hoy?' }, ...parsedMessages]);
            } catch (err) {
                console.error('Error al inicializar el chat:', err);
            }
        };

        initChat();
    }, []);


    const sendMessage = async () => {
        if (!input.trim() || !chatId) return;

        const newMessage = { sender: 'Tú', text: input };
        setMessages(prev => [...prev, newMessage]);
        setInput('');
        setLoading(true);

        try {
            const res = await authFetch(`${apiUrl}/chats/${chatId}/messages/ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: input }),
            });

            const data = await res.json();
            setMessages(prev => [...prev, { sender: 'Solvix', text: data.reply }]);
        } catch (err) {
            setMessages(prev => [...prev, { sender: 'Solvix', text: '⚠️ Error al comunicarse con la IA.' }]);
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

    return (
        <Box className={styles.chatContainer}>
            <Box
                className={`${styles.chatSidebar} ${darkMode ? styles.darkChatSidebar : ''}`}
            >
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Buscar..."
                    variant="outlined"
                    sx={{
                        input: {
                            color: darkMode ? '#f1f1f1' : '#000',
                        },
                        '& .MuiOutlinedInput-root': {
                            '& fieldset': {
                                borderColor: darkMode ? '#555' : '#ccc',
                            },
                            '&:hover fieldset': {
                                borderColor: darkMode ? '#888' : '#888',
                            },
                        },
                        '& .MuiInputLabel-root': {
                            color: darkMode ? '#bbb' : '#000',
                        },
                    }}
                />
                <Divider sx={{ my: 2, borderColor: darkMode ? '#444' : '#ddd' }} />
                <List>
                    <ListItem selected>
                        <ListItemAvatar>
                            <Avatar
                                alt="Solvix"
                                src="https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/logotipo.png"
                            />
                        </ListItemAvatar>
                        <ListItemText primary="Solvix" secondary="" />
                    </ListItem>
                </List>
            </Box>

            <Box
                className={`${styles.chatMain} ${darkMode ? styles.darkChatMain : ''}`}
                sx={{
                    bgcolor: darkMode ? '#121212' : '#fff',
                    color: darkMode ? '#f1f1f1' : '#000',
                }}
            >
                <Paper
                    elevation={2}
                    className={styles.chatMessages}
                    sx={{
                        p: 2,
                        overflowY: 'auto',
                        maxHeight: '70vh',
                        bgcolor: darkMode ? '#121212' : '#fff',
                        color: darkMode ? '#f1f1f1' : '#000',
                    }}
                >
                    {messages.map((msg, idx) => {
                        const isUser = msg.sender === 'Tú';

                        return (
                            <Box
                                key={idx}
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: isUser ? 'flex-end' : 'flex-start',
                                    mb: 1.5,
                                    px: 1,
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: isUser ? '#1976d2' : darkMode ? '#aaa' : '#555',
                                        fontWeight: 'bold',
                                        mb: 0.3,
                                    }}
                                >
                                    {msg.sender}
                                </Typography>

                                <Paper
                                    elevation={3}
                                    sx={{
                                        maxWidth: '70%',
                                        p: 2,
                                        bgcolor: isUser ? '#1976d2' : darkMode ? '#333' : '#e0e0e0',
                                        color: isUser ? 'white' : darkMode ? '#eee' : 'black',
                                        borderRadius: 2,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        fontSize: '0.95rem',
                                    }}
                                >
                                    <ReactMarkdown
                                        components={{
                                            p: ({ node, ...props }) => (
                                                <Typography
                                                    component="p"
                                                    sx={{ margin: 0, mb: 1, color: darkMode ? '#eee' : 'inherit' }}
                                                    {...props}
                                                />
                                            ),
                                            code({ inline, children, className }) {
                                                return inline ? (
                                                    <code
                                                        style={{
                                                            backgroundColor: darkMode ? '#444' : '#eee',
                                                            padding: '2px 6px',
                                                            borderRadius: 4,
                                                            fontSize: '0.85em',
                                                            fontFamily: 'source-code-pro, monospace',
                                                        }}
                                                    >
                                                        {children}
                                                    </code>
                                                ) : (
                                                    <Box
                                                        component="pre"
                                                        sx={{
                                                            backgroundColor: darkMode ? '#222' : '#f5f5f5',
                                                            p: 1,
                                                            borderRadius: 1,
                                                            overflowX: 'auto',
                                                            fontSize: '0.9rem',
                                                            fontFamily: 'source-code-pro, monospace',
                                                        }}
                                                    >
                                                        <code className={className}>{children}</code>
                                                    </Box>
                                                );
                                            },
                                        }}
                                    >
                                        {msg.text}
                                    </ReactMarkdown>
                                </Paper>
                            </Box>
                        );
                    })}
                </Paper>

                <Box className={styles.inputArea} sx={{ mt: 1 }}>
                    <TextField
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        multiline
                        fullWidth
                        rows={2}
                        placeholder="Escribe tu mensaje..."
                        disabled={loading}
                        sx={{
                            textarea: {
                                color: darkMode ? '#f1f1f1' : '#000',
                            },
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: darkMode ? '#2c2c2c' : '#fff',
                                '& fieldset': {
                                    borderColor: darkMode ? '#555' : '#ccc',
                                },
                                '&:hover fieldset': {
                                    borderColor: darkMode ? '#777' : '#888',
                                },
                            },
                            '& .MuiInputLabel-root': {
                                color: darkMode ? '#bbb' : '#000',
                            },
                        }}
                    />
                    <Button
                        variant="contained"
                        onClick={sendMessage}
                        disabled={loading}
                        sx={{
                            ml: 2,
                            bgcolor: darkMode ? '#1976d2' : undefined,
                            '&:hover': {
                                bgcolor: darkMode ? '#1565c0' : undefined,
                            },
                        }}
                    >
                        Enviar
                    </Button>
                </Box>
            </Box>
        </Box>
    );
};

export default ChatSolvixComponent;
