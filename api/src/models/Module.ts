import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Course from './Course';
import Lesson from './Lesson';


class Module extends Model {
  public id!: number;
  public courseId!: number;
  public title!: string;
  public order!: number;

  public static associate() {
    Module.belongsTo(Course, { foreignKey: 'courseId' });
    Module.hasMany(Lesson, { foreignKey: 'moduleId' });
  }
}

Module.init({
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
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
  }
}, {
  sequelize,
  modelName: 'Module',
  tableName: 'Module',
  timestamps: false,
});

export default Module;
