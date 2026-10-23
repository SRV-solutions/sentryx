import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';

/** Link de un solo uso (5 minutos) para entrar en el celular escaneando el QR de una sesión abierta. Se guarda hasheado. */
class LoginLinkToken extends Model<InferAttributes<LoginLinkToken>, InferCreationAttributes<LoginLinkToken>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare usedAt: Date | null;
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
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'LoginLinkToken', tableName: 'LoginLinkToken', updatedAt: false, indexes: [{ fields: ['userId'] }] }
);

export default LoginLinkToken;
