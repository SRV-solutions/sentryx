import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';

/**
 * Una sesión por dispositivo (cada login). El token lleva su id (sid): así se puede cerrar la sesión
 * de un celular desde la PC y se sabe cuándo se usó por última vez (vence a los 30 días sin uso).
 */
class UserSession extends Model<InferAttributes<UserSession>, InferCreationAttributes<UserSession>> {
  declare id: string;
  declare userId: ForeignKey<User['id']>;
  /** "Chrome · Windows", "App Sentryx 1.0.0 · Android", "QR · iPhone"… */
  declare device: string;
  declare ip: string | null;
  declare lastUsedAt: Date;
  declare revokedAt: Date | null;
  declare createdAt: CreationOptional<Date>;

  public static associate() {
    UserSession.belongsTo(User, { foreignKey: 'userId' });
  }
}

UserSession.init(
  {
    id: { type: DataTypes.STRING(32), primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    device: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Dispositivo' },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    lastUsedAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'UserSession', tableName: 'UserSession', updatedAt: false, indexes: [{ fields: ['userId', 'lastUsedAt'] }] }
);

export default UserSession;
