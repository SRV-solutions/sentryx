import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';
import Chat from './Chat';

class ChatUser extends Model {
    public id!: number;
    public chatId!: number;
    public userId!: number;
    public isAdmin!: boolean;
    public lastReadMessageId!: number | null;
    public Chat!: Chat;
    public static associate() {
        ChatUser.belongsTo(User, { foreignKey: 'userId' });
        ChatUser.belongsTo(Chat, { foreignKey: 'chatId' });
    }
}

ChatUser.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    chatId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Chat',
            key: 'id',
        },
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'User',
            key: 'id',
        },
    },
    isAdmin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    lastReadMessageId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'ChatMessage',
            key: 'id',
        },
    },

}, {
    sequelize,
    modelName: 'ChatUser',
    tableName: 'ChatUser',
    timestamps: true,
});

export default ChatUser;
