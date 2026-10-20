import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import type { RoleCode, RoleScope, Category } from '../constants/roles';
import type { Permission } from './Permission';

/**
 * Rol (ej: DOCENTE, PRECEPTOR, SUPERADMIN). Tiene muchos permisos (RolePermission) y se asigna a los
 * usuarios con UserRole. El catálogo por defecto está en constants/roles.ts.
 */
export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: CreationOptional<number>;
  declare code: RoleCode;
  declare name: string;
  declare scope: RoleScope;
  declare category: Category | null;
  declare rank: number;
  declare schoolWide: boolean;
  declare leadership: boolean;
  declare description: string;
  /** Rol personalizado de un colegio (null = del catálogo, vale para todos). */
  declare schoolId: CreationOptional<number | null>;
  declare Permissions?: NonAttribute<Permission[]>;
}

Role.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    scope: { type: DataTypes.STRING(20), allowNull: false },
    category: { type: DataTypes.STRING(20), allowNull: true },
    rank: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    schoolWide: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    leadership: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    description: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
    schoolId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { sequelize, modelName: 'Role', tableName: 'Role', timestamps: false }
);

export default Role;
