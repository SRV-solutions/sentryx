import { useState } from 'react';
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
import { useAuth } from '../context/AuthContext'
const apiUrl = import.meta.env.VITE_API_URL;

const ChatSolvixComponent = () => {
    const [messages, setMessages] = useState([
        { sender: 'Solvix', text: 'Hola 👋 ¿En qué puedo ayudarte hoy?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const authFetch = useAuth()
    const sendMessage = async () => {
        if (!input.trim()) return;
        const newMessage = { sender: 'Tú', text: input };
        setMessages(prev => [...prev, newMessage]);
        setInput('');
        setLoading(true);

        try {
            const res = await authFetch(`${apiUrl}/api/ai/chat`, {
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
            {/* Chat List */}
            <Box className={styles.chatSidebar}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Buscar..."
                    variant="outlined"
                />
                <Divider sx={{ my: 2 }} />
                <List>
                    <ListItem selected>
                        <ListItemAvatar>
                            <Avatar alt="Solvix" src="https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/logotipo.png" />
                        </ListItemAvatar>
                        <ListItemText style={{ color: 'black' }} primary="Solvix" secondary="Powered By Sentryx" />
                    </ListItem>
                </List>
            </Box>

            {/* Chat Window */}
            <Box className={styles.chatMain}>
                <Paper elevation={2} className={styles.chatMessages} sx={{ p: 2, overflowY: 'auto', maxHeight: '70vh' }}>
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
                                        color: isUser ? '#1976d2' : '#555',
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
                                        bgcolor: isUser ? '#1976d2' : '#e0e0e0',
                                        color: isUser ? 'white' : 'black',
                                        borderRadius: 2,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        fontSize: '0.95rem',
                                        boxShadow: isUser
                                            ? '0 3px 10px rgba(25, 118, 210, 0.4)'
                                            : '0 3px 10px rgba(0,0,0,0.1)',
                                    }}
                                >
                                    <ReactMarkdown
                                        components={{
                                            p: ({ node, ...props }) => <Typography component="p" sx={{ margin: 0, mb: 1 }} {...props} />,
                                            code({ inline, children, className }) {
                                                return inline ? (
                                                    <code
                                                        style={{
                                                            backgroundColor: '#eee',
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
                                                            backgroundColor: '#f5f5f5',
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

                {/* Input */}
                <Box className={styles.inputArea} sx={{ display: 'flex', mt: 2 }}>
                    <TextField
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        multiline
                        fullWidth
                        rows={2}
                        placeholder="Escribe tu mensaje..."
                        disabled={loading}
                    />
                    <Button
                        variant="contained"
                        onClick={sendMessage}
                        disabled={loading}
                        sx={{ ml: 2 }}
                    >
                        Enviar
                    </Button>
                </Box>
            </Box>
        </Box>
    );
};

export default ChatSolvixComponent;
