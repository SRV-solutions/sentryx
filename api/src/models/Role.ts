import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';
import Permission from './Permission';
import RolePermission from './RolePermission';

class Role extends Model {
  public id!: number;
  public roleName!: string;
  public description?: string;  // Nuevo campo
  public Permissions?: [Permission];  // Nuevo campo
  

  public static associate() {
    Role.hasMany(User, { foreignKey: 'roleId' });

    Role.belongsToMany(Permission, {
      through: RolePermission,
      foreignKey: 'roleId',
      otherKey: 'permissionId',
    });
  }
}

Role.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  roleName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,  // Cambiar según si lo quieres obligatorio
  },
}, {
  sequelize,
  modelName: 'Role',
  tableName: 'Role',
  timestamps: false,
});

export default Role;
