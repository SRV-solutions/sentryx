import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';
import Reward from './Reward';

class UserReward extends Model {
  public id!: number;
  public userId!: number;
  public rewardId!: number;
  public redeemedAt!: Date;

  public static associate() {
    UserReward.belongsTo(User, { foreignKey: 'userId' });
    UserReward.belongsTo(Reward, { foreignKey: 'rewardId' });
    User.hasMany(UserReward, { foreignKey: 'userId' });
    Reward.hasMany(UserReward, { foreignKey: 'rewardId' });
  }
}

UserReward.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    rewardId: { type: DataTypes.INTEGER, allowNull: false },
    redeemedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'UserReward',
    tableName: 'UserReward',
    timestamps: false,
  }
);

export default UserReward;
