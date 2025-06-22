import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';
import Notification from './Notification';

class UserNotification extends Model {
    public id!: number;
    public userId!: number;
    public notificationId!: number;
    public read!: boolean;
    public seenAt!: Date | null;

    public static associate() {
        UserNotification.belongsTo(User, { foreignKey: 'userId' });
        UserNotification.belongsTo(Notification, { foreignKey: 'notificationId' });
    }
}

UserNotification.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        notificationId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        read: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        seenAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'UserNotification',
        tableName: 'UserNotification',
        timestamps: true,
    }
);

export default UserNotification;
