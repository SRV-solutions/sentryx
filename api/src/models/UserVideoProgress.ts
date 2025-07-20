import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

import User from './User';
import Lesson from './Lesson';

class UserVideoProgress extends Model {
  public id!: number;
  public userId!: number;
  public videoId!: number;
  public progress!: number; // Porcentaje del video visto (0-100)
  public lastWatchedAt!: Date; // Fecha en que vio por última vez
  public completed!: boolean;

  public static associate() {
    UserVideoProgress.belongsTo(User, { foreignKey: 'userId' });
    UserVideoProgress.belongsTo(Lesson, { foreignKey: 'videoId' });
  }
}

UserVideoProgress.init(
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
    },
    videoId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Lesson',
        key: 'id',
      },
    },
    progress: {
      type: DataTypes.FLOAT, // Ej: 25.5 significa 25.5% del video
      allowNull: false,
      defaultValue: 0,
    },
    lastWatchedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'UserVideoProgress',
    tableName: 'UserVideoProgress',
    timestamps: false,
  }
);

export default UserVideoProgress;
