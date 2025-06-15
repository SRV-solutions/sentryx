import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Chat from './Chat';
import User from './User';

class ChatMessage extends Model {
  public id!: number;
  public chatId!: number;
  public senderId!: number | null;
  public message!: string;
  public isAssistant!: boolean;


  public static associate() {
    ChatMessage.belongsTo(Chat, { foreignKey: 'chatId' });
    ChatMessage.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
  }
}

ChatMessage.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  chatId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Chat',
      key: 'id',
    },
  },
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: true, // null si es el assistant
    references: {
      model: 'User',
      key: 'id',
    },
  },
  isAssistant: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
}, {
  sequelize,
  modelName: 'ChatMessage',
  tableName: 'ChatMessage',
  timestamps: true,
});

export default ChatMessage;
