import { Box, Paper, Typography } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import styles from './ChatSolvix.module.css';


const ChatMessages = ({ messages, isTyping, user, darkMode, messagesEndRef }) => {
    return (

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
                const isUser = msg.senderId === user.userData.id;
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
                            {msg.Chat?.type === 'GROUP' ? msg.sender?.username : ''}
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
                                {msg.message}
                            </ReactMarkdown>
                        </Paper>
                    </Box>
                );
            })}
            {isTyping && (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        mb: 1.5,
                        px: 1,
                    }}
                >
                    <Typography
                        variant="caption"
                        sx={{
                            color: darkMode ? '#aaa' : '#555',
                            fontWeight: 'bold',
                            mb: 0.3,
                        }}
                    >
                        Solvix
                    </Typography>
                    <Paper
                        elevation={3}
                        sx={{
                            maxWidth: '50%',
                            p: 2,
                            bgcolor: darkMode ? '#333' : '#e0e0e0',
                            color: darkMode ? '#eee' : 'black',
                            borderRadius: 2,
                            fontSize: '0.95rem',
                        }}
                    >
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Dot />
                            <Dot delay="0.2s" />
                            <Dot delay="0.4s" />
                        </Box>
                    </Paper>
                </Box>
            )}

            <div ref={messagesEndRef} />

        </Paper>

    );
};

export default ChatMessages;

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
