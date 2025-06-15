import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

import Chat from './Chat';
import UserCourse from './UserCourse';
import Role from './Role';
import Friendship from './Friendship';


class User extends Model {
  public id!: number;
  public username!: string;
  public fistName!: string;
  public lastName!: string;
  public email!: string;
  public password!: string; // Campo para almacenar la contraseña
  public roleId!: number;
  public Role!: Role
  public UserCourses!: Array<UserCourse>
  // Asociaciones con otros modelos
  public static associate() {
    User.belongsTo(Role, { foreignKey: 'roleId' });
    User.hasMany(Chat, { foreignKey: 'userId' });
    User.hasMany(UserCourse, { foreignKey: 'userId' });
        // Asociaciones para amistades (Friendships)
    // Amistades donde el usuario es quien envía la solicitud
    User.hasMany(Friendship, { foreignKey: 'requesterId', as: 'friendRequestsSent' });

    // Amistades donde el usuario es quien recibe la solicitud
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
    fistName: {
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
      allowNull: false, // Contraseña es obligatoria
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
