import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';

class UserPoints extends Model {
  public id!: number;
  public userId!: number;
  public points!: number;
  public level!: number;

  public static associate() {
    UserPoints.belongsTo(User, { foreignKey: 'userId' });
    User.hasOne(UserPoints, { foreignKey: 'userId' });
  }
}

UserPoints.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  },
  {
    sequelize,
    modelName: 'UserPoints',
    tableName: 'UserPoints',
    timestamps: false,
  }
);

export default UserPoints;
