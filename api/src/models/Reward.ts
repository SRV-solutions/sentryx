import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

class Reward extends Model {
  public id!: number;
  public name!: string;
  public description!: string;
  public imageUrl!: string | null;
  public cost!: number;

  public static associate() {
    // Las asociaciones con UserReward van en UserReward
  }
}

Reward.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    imageUrl: { type: DataTypes.STRING, allowNull: true },
    cost: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    modelName: 'Reward',
    tableName: 'Reward',
    timestamps: false,
  }
);

export default Reward;
