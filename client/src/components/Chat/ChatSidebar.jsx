import {
    TextField, Divider, List, ListItem, ListItemAvatar, Avatar, ListItemText, Badge
} from '@mui/material';
import { Box } from '@mui/system';
import { useTheme } from '../../context/ThemeContext';
import styles from './ChatSolvix.module.css';

const ChatSidebar = ({
    chats,
    activeChat,
    handleChatClick,
    notificationMessages,
    search,
    setSearch,
    user
}) => {
    const { darkMode } = useTheme();

    return (
        <Box
            className={`${styles.chatSidebar} ${darkMode ? styles.darkChatSidebar : ''}`}
        >
            <TextField
                fullWidth
                size="small"
                placeholder="Buscar..."
                variant="outlined"
                value={search}
                onChange={(e) => setSearch(e.target.value.toLowerCase())}
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
                {chats
                    .filter(chat => {
                        const name =
                            chat.chatType === 'private'
                                ? chat.Users?.[1]?.firstName?.toLowerCase()
                                : chat.title?.toLowerCase();

                        return name?.includes(search);
                    })
                    .map((chat) => (
                        <ListItem
                            key={chat.id}
                            selected={Number(activeChat) === chat.id}
                            button
                            onClick={() => handleChatClick(chat.id)}
                            sx={{
                                bgcolor: Number(activeChat) === chat.id
                                    ? darkMode ? '#333' : '#e3f2fd'
                                    : 'transparent',
                                '&:hover': {
                                    bgcolor: darkMode ? '#2c2c2c' : '#f5f5f5',
                                },
                            }}
                        >
                            <ListItemAvatar>
                                <Badge
                                    badgeContent={notificationMessages[chat.id] || 0}
                                    color="error"
                                    overlap="circular"
                                    invisible={!(notificationMessages[chat.id] > 0)} // Oculta si es 0
                                >
                                    <Avatar
                                        alt={chat.title}
                                        src={
                                            chat.chatType === 'private'
                                                ? chat.Users?.find(u => u.id !== user.userData.id)?.avatar
                                                : chat.chatType === 'ai'
                                                    ? 'https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/logotipo.png'
                                                    : undefined
                                        }
                                    />
                                </Badge>
                            </ListItemAvatar>
                            <ListItemText
                                primary={
                                    chat.chatType === 'private'
                                        ? chat.Users?.map(chatUser =>
                                            user.userData.id !== chatUser.id && chatUser.firstName
                                        )
                                        : chat.title || 'Chat'
                                }
                                secondary={
                                    chat.chatType === 'ai'
                                        ? 'Asistente IA'
                                        : chat.chatType === 'group'
                                            ? 'Grupo'
                                            : 'Privado'
                                }
                            />
                        </ListItem>
                    ))}
            </List>
        </Box>
    );
};

export default ChatSidebar;
