import { createContext, useContext, useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [unreadCounts, setUnreadCounts] = useState({});
  const socketRef = useRef(null);
  const { user } = useAuth()
  useEffect(() => {
    socketRef.current = io(import.meta.env.VITE_API_URL, {
      query: { userId: user.userData.id },
      auth: { token: user.token }
    });

    socketRef.current.on('new_message', (data) => {

      if (Number(user.userData.id) === Number(data.message.senderId)) {
        return ''
      }

      setUnreadCounts(prev => ({
        ...prev,
        [data.chatId]: (prev[data.chatId] || 0) + 1
      }));

    });
  }, []);

  const chatUnreadCount = Object.values(unreadCounts).reduce((sum, val) => sum + val, 0);

  return (
    <ChatContext.Provider value={{ unreadCounts, setUnreadCounts, chatUnreadCount }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
