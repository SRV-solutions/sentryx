import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';
import ChatMessage from './ChatMessage';
import { ChatType } from './enums'; // Asegurate de importar el enum

class Chat extends Model {
  public id!: number;
  public title!: string;
  public type!: ChatType;
  public userId!: number;

  public static associate() {
    Chat.belongsTo(User, { foreignKey: 'userId' });
    Chat.hasMany(ChatMessage, { foreignKey: 'chatId' });
  }
}

Chat.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('AI', 'PRIVATE', 'GROUP'), // asegurate que coincida con tu enum
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    modelName: 'Chat',
    tableName: 'Chat',
    timestamps: true,
  }
);

export default Chat;
