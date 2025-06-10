import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

class RolePermission extends Model {
  public id!: number;
  public roleId!: number;
  public permissionId!: number;
}

RolePermission.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  roleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  permissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  sequelize,
  modelName: 'RolePermission',
  tableName: 'RolePermission',
  timestamps: false,
});

export default RolePermission;
