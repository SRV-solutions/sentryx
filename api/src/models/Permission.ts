import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';
import type { Entity, Action } from '../constants/permissions';

/** Permiso = una ACCIÓN sobre una ENTIDAD (ej: update sobre users). Ver constants/permissions.ts. */
export class Permission extends Model<InferAttributes<Permission>, InferCreationAttributes<Permission>> {
  declare id: CreationOptional<number>;
  declare entity: Entity;
  declare action: Action;
  declare description: string;
}

Permission.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entity: { type: DataTypes.STRING(40), allowNull: false },
    action: { type: DataTypes.STRING(40), allowNull: false },
    description: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
  },
  { sequelize, modelName: 'Permission', tableName: 'Permission', timestamps: false, indexes: [{ unique: true, fields: ['entity', 'action'] }] }
);

export default Permission;
