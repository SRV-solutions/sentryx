import { Model, DataTypes, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

/** Qué permisos tiene cada rol (un rol tiene muchos permisos). */
export class RolePermission extends Model<InferAttributes<RolePermission>, InferCreationAttributes<RolePermission>> {
  declare roleId: number;
  declare permissionId: number;
}

RolePermission.init(
  {
    roleId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'Role', key: 'id' }, onDelete: 'CASCADE' },
    permissionId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'Permission', key: 'id' }, onDelete: 'CASCADE' },
  },
  { sequelize, modelName: 'RolePermission', tableName: 'RolePermission', timestamps: false }
);

export default RolePermission;
