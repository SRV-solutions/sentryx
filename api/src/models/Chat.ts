import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';
import ChatMessage from './ChatMessage';

class Chat extends Model {
  public id!: number;
  public userId!: number;

  public static associate() {
    Chat.belongsTo(User, { foreignKey: 'userId' });
    Chat.hasMany(ChatMessage, { foreignKey: 'chatId' });
  }
}

Chat.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'User',
      key: 'id',
    },
  },
}, {
  sequelize,
  modelName: 'Chat',
  tableName: 'Chat',
  timestamps: true,
});

export default Chat;
