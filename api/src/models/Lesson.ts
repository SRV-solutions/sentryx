import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Course from './Course';

class Lesson extends Model {
  public id!: number;
  public courseId!: number;
  public title!: string;
  public youtubeUrl!: string;
  public order!: number;

  public static associate() {
    Lesson.belongsTo(Course, { foreignKey: 'courseId' });
  }
}

Lesson.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Course',
      key: 'id',
    },
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  youtubeUrl: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

}, {
  sequelize,
  modelName: 'Lesson',
  tableName: 'Lesson',
  timestamps: false,
});

export default Lesson;
