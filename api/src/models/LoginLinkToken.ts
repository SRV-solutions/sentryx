import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';

/** Link de ingreso de un solo uso, hasheado: QR (5 minutos) o botón de un mail de acceso (7 días). Ver services/loginLinks.ts. */
class LoginLinkToken extends Model<InferAttributes<LoginLinkToken>, InferCreationAttributes<LoginLinkToken>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare purpose: CreationOptional<'QR' | 'EMAIL'>;
  /** Versión de sesión del usuario al emitirlo: si cambia la contraseña, el link deja de servir. */
  declare ver: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;

  public static associate() {
    LoginLinkToken.belongsTo(User, { foreignKey: 'userId' });
  }
}

LoginLinkToken.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
    purpose: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'QR' },
    ver: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'LoginLinkToken', tableName: 'LoginLinkToken', updatedAt: false, indexes: [{ fields: ['userId'] }] }
);

export default LoginLinkToken;
