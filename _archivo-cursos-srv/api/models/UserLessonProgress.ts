import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

import User from './User';
import Lesson from './Lesson';

class UserLessonProgress extends Model {
  public id!: number;
  public userId!: number;
  public lessonId!: number;
  public watchedDuration!: number;
  public completed!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associate() {
    UserLessonProgress.belongsTo(User, { foreignKey: 'userId' });
    UserLessonProgress.belongsTo(Lesson, { foreignKey: 'lessonId' });
  }
}

UserLessonProgress.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    lessonId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    watchedDuration: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'UserLessonProgress',
    tableName: 'UserLessonProgress',
    timestamps: true,
  }
);

export default UserLessonProgress;
