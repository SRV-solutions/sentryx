import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';

class Notification extends Model {
    public id!: number;
    public title!: string;
    public message!: string;
    public type!: string;
    public link?: string;
    public createdAt!: Date;
    public updatedAt!: Date;

    public static associate() {
        Notification.belongsToMany(User, {
            through: 'UserNotification',
            foreignKey: 'notificationId',
            as: 'recipients',
        });
    }
}

Notification.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING, // Ej: 'promo', 'info', 'warning'
            allowNull: false,
        },
        link: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'Notification',
        tableName: 'Notification',
        timestamps: true,
    }
);

export default Notification;
