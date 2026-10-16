import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';

import Chat from './Chat';
import UserCourse from './UserCourse';
import Role from './Role';
import Friendship from './Friendship';
import Notification from './Notification';
import UserLessonProgress from './UserLessonProgress';
import ChatUser from './ChatUser';

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare username: string;
  declare firstName: string;
  declare lastName: string;
  declare email: string;
  declare password: string;
  declare roleId: number;
  declare dni: string | null;
  declare phone: string | null;
  declare biography: string | null;
  declare avatar: string | null;
  declare lastLogin: Date | null;
  /** Se fuerza al cambiar la contraseña temporal enviada por administración. */
  declare mustChangePassword: CreationOptional<boolean>;
  declare isActive: CreationOptional<boolean>;
  declare Role?: NonAttribute<Role>;
  declare UserCourses?: NonAttribute<UserCourse[]>;

  get fullName(): NonAttribute<string> {
    return `${this.firstName} ${this.lastName}`;
  }

  public static associate() {
    User.belongsTo(Role, { foreignKey: 'roleId' });
    User.hasMany(UserCourse, { foreignKey: 'userId' });
    User.belongsToMany(Notification, { through: 'UserNotification', foreignKey: 'userId' });
    User.hasMany(Friendship, { foreignKey: 'requesterId', as: 'friendRequestsSent' });
    User.hasMany(Friendship, { foreignKey: 'receiverId', as: 'friendRequestsReceived' });
    User.hasMany(UserLessonProgress, { foreignKey: 'userId' });
    User.belongsToMany(Chat, { through: 'ChatUser', foreignKey: 'userId', otherKey: 'chatId', as: 'Chats' });
    User.hasMany(ChatUser, { foreignKey: 'userId', as: 'ChatUsers' });
  }
}

User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    firstName: { type: DataTypes.STRING, allowNull: false },
    lastName: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    dni: { type: DataTypes.STRING(15), allowNull: true, unique: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    avatar: { type: DataTypes.TEXT, allowNull: true },
    biography: { type: DataTypes.TEXT, allowNull: true },
    lastLogin: { type: DataTypes.DATE, allowNull: true },
    mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    roleId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Role', key: 'id' } },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'User',
    timestamps: false,
    defaultScope: { attributes: { exclude: ['password'] } },
    scopes: { withPassword: { attributes: { include: ['password'] } } },
  }
);

/** Campos seguros para exponer de otro usuario. */
export const PUBLIC_USER_ATTRS = ['id', 'firstName', 'lastName', 'username', 'avatar'] as const;

export default User;
