import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';

class PasswordResetToken extends Model {
  public id!: number;
  public userId!: number;
  public token!: string;
  public expiresAt!: Date;

  public static associate() {
    PasswordResetToken.belongsTo(User, { foreignKey: 'userId' });
  }
}

PasswordResetToken.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'PasswordResetToken',
    tableName: 'PasswordResetToken',
    timestamps: true,
  }
);

export default PasswordResetToken;
