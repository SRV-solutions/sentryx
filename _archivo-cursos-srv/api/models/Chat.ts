import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';
import ChatMessage from './ChatMessage';
import { ChatType } from './enums'; // Asegurate de importar el enum
import ChatUser from './ChatUser';

class Chat extends Model {
  public id!: number;
  public title!: string;
  public type!: ChatType;
  public Users!: Array<User>;

  public static associate() {
    Chat.hasMany(ChatMessage, { foreignKey: 'chatId'});
    Chat.belongsToMany(User, { through: 'ChatUser', foreignKey: 'chatId' });
    Chat.hasMany(ChatUser, { foreignKey: 'chatId' }); // para acceder a isAdmin
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
      type: DataTypes.ENUM('AI', 'PRIVATE', 'GROUP'),
      allowNull: false,
    },
    // userId se elimina completamente
  },
  {
    sequelize,
    modelName: 'Chat',
    tableName: 'Chat',
    timestamps: true,
  }
);


export default Chat;
