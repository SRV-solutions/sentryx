import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';

import Notification from './Notification';

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare username: string;
  declare firstName: string;
  declare lastName: string;
  declare email: string;
  declare password: string;
  declare dni: string | null;
  declare phone: string | null;
  declare biography: string | null;
  declare avatar: string | null;
  declare lastLogin: Date | null;
  /** Se fuerza al cambiar la contraseña temporal enviada por administración. */
  declare mustChangePassword: CreationOptional<boolean>;
  declare isActive: CreationOptional<boolean>;
  /** Versión de sesión: sube al cambiar/blanquear la contraseña e invalida los tokens anteriores. */
  declare tokenVersion: CreationOptional<number>;
  /** Tutoriales de SOLVIX: cuáles terminó y cuáles omitió. */
  declare tutorials: CreationOptional<{ done: string[]; skipped: string[] }>;

  get fullName(): NonAttribute<string> {
    return `${this.firstName} ${this.lastName}`;
  }

  public static associate() {
    User.belongsToMany(Notification, { through: 'UserNotification', foreignKey: 'userId' });
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
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    tutorials: { type: DataTypes.JSONB, allowNull: false, defaultValue: { done: [], skipped: [] } },
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
