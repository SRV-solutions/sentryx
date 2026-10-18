import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Lesson from './Lesson';
import UserCourse from './UserCourse';
import Module from './Module';

class Course extends Model {
  public id!: number;
  public title!: string;
  public description!: string;
  public thumbnailUrl?: string;
  public price!: number;
  public Modules?: Array<Module>;


  public static associate() {
    Course.hasMany(Module, { foreignKey: 'courseId' });  // nuevo
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
    type: DataTypes.TEXT('medium'),
    allowNull: false,
  },
  price: {
    // DECIMAL igual que la migración real (NUMBER no existe en Postgres y rompía sync()).
    type: DataTypes.DECIMAL,
    allowNull: true,
    get() {
      const v = this.getDataValue('price');
      return v === null || v === undefined ? null : Number(v);
    },
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
