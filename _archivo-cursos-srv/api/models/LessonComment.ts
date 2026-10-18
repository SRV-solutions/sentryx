import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';
import Lesson from './Lesson';

class LessonComment extends Model {
  public id!: number;
  public lessonId!: number;
  public userId!: number;
  public comment!: string;
  public rating!: number; // 1 a 5 estrellas
  public createdAt!: Date;
  public updatedAt!: Date;

  public static associate() {
    LessonComment.belongsTo(User, { foreignKey: 'userId' });
    LessonComment.belongsTo(Lesson, { foreignKey: 'lessonId' });
  }
}

LessonComment.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  lessonId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Lesson',  // plural y minúscula
      key: 'id',
    },
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'User',   // plural y minúscula
      key: 'id',
    },
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 5 },
  },
}, {
  sequelize,
  modelName: 'LessonComment',
  tableName: 'LessonComment',  // plural y snake_case
  timestamps: true,
});

export default LessonComment;
