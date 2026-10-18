import { createContext, useCallback, useContext, useState } from 'react';
import { useAuth } from './AuthContext';
import { useSocketEvent } from './SocketContext';

const ChatContext = createContext({ unreadCounts: {}, setUnreadCounts: () => {}, chatUnreadCount: 0 });

/** Contador de no leídos del chat social/Solvix. Usa el socket compartido. */
export const ChatProvider = ({ children }) => {
  const [unreadCounts, setUnreadCounts] = useState({});
  const { user } = useAuth();

  const onMessage = useCallback(
    (data) => {
      if (Number(user?.userData?.id) === Number(data.message.senderId)) return;
      setUnreadCounts((prev) => ({ ...prev, [data.chatId]: (prev[data.chatId] || 0) + 1 }));
    },
    [user?.userData?.id]
  );
  useSocketEvent('new_message', onMessage);

  const chatUnreadCount = Object.values(unreadCounts).reduce((sum, val) => sum + val, 0);

  return <ChatContext.Provider value={{ unreadCounts, setUnreadCounts, chatUnreadCount }}>{children}</ChatContext.Provider>;
};

export const useChat = () => useContext(ChatContext);
