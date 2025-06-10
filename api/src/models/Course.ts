import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Lesson from './Lesson';
import UserCourse from './UserCourse';

class Course extends Model {
  public id!: number;
  public title!: string;
  public description!: string;
  public thumbnailUrl?: string;

  public static associate() {
    Course.hasMany(Lesson, { foreignKey: 'courseId' });
    Course.hasMany(UserCourse, { foreignKey: 'courseId' });
  }
}

Course.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  thumbnailUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'Course',
  tableName: 'Course',
  timestamps: true,
});

export default Course;
