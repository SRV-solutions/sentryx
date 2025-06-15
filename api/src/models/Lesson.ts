import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Course from './Course';
import Module from './Module';

class Lesson extends Model {
  public id!: number;
  public moduleId!: number;  // nuevo campo
  public title!: string;
  public description!: string;
  public youtubeUrl!: string;
  public order!: number;

  public static associate() {
    Lesson.belongsTo(Module, { foreignKey: 'moduleId' });
  }
}

Lesson.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  moduleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Module',
      key: 'id',
    }
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
