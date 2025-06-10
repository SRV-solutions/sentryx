import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Role from './Role';
import RolePermission from './RolePermission';

class Permission extends Model {
  public id!: number;
  public entity!: string;
  public action!: string;

  public static associate() {
    Permission.belongsToMany(Role, {
      through: RolePermission,
      foreignKey: 'permissionId',
      otherKey: 'roleId',
    });
  }
}

Permission.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  entity: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  sequelize,
  modelName: 'Permission',
  tableName: 'Permission',
  timestamps: false,
});

export default Permission;
