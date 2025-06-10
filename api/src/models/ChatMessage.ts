import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Chat from './Chat';

class ChatMessage extends Model {
  public id!: number;
  public chatId!: number;
  public sender!: 'user' | 'assistant';
  public message!: string;

  public static associate() {
    ChatMessage.belongsTo(Chat, { foreignKey: 'chatId' });
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
  sender: {
    type: DataTypes.ENUM('user', 'assistant'),
    allowNull: false,
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
