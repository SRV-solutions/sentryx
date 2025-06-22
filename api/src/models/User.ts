import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

import Chat from './Chat';
import UserCourse from './UserCourse';
import Role from './Role';
import Friendship from './Friendship';
import Notification from './Notification';


class User extends Model {
  public id!: number;
  public username!: string;
  public firstName!: string;
  public lastName!: string;
  public email!: string;
  public password!: string; // Campo para almacenar la contraseña
  public roleId!: number;
  public Role!: Role;
  public lastLogin!: Date | null;
  public UserCourses!: Array<UserCourse>
  // Asociaciones con otros modelos
  public static associate() {
    User.belongsTo(Role, { foreignKey: 'roleId' });
    User.hasMany(Chat, { foreignKey: 'userId' });
    User.hasMany(UserCourse, { foreignKey: 'userId' });
    User.belongsToMany(Notification, { through: 'UserNotification', foreignKey: 'userId' });
    User.hasMany(Friendship, { foreignKey: 'requesterId', as: 'friendRequestsSent' });
    User.hasMany(Friendship, { foreignKey: 'receiverId', as: 'friendRequestsReceived' });
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    roleId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Role',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'User',
    timestamps: false,
  }
);

export default User;
