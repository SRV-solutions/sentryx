import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';
import Course from './Course';

class UserCourse extends Model {
  public id!: number;
  public userId!: number;
  public courseId!: number;
  public grantedAt!: Date;

  public static associate() {
    UserCourse.belongsTo(User, { foreignKey: 'userId' });
    UserCourse.belongsTo(Course, { foreignKey: 'courseId' });
  }
}

UserCourse.init({
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
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Course',
      key: 'id',
    },
  },
  grantedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize,
  modelName: 'UserCourse',
  tableName: 'UserCourse',
  timestamps: false,
});

export default UserCourse;
