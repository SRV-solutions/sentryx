import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import type { RoleCode } from '../constants/roles';
import type { School, Level } from './school/structure';

/**
 * Rol asignado a un usuario (un usuario tiene muchos roles).
 *  - Rol de plataforma (SUPERADMIN): schoolId = null.
 *  - Rol de colegio: schoolId del colegio y, opcionalmente, el alcance (nivel o divisiones).
 * Se desactiva con active = false (baja lógica: nunca se borra).
 */
export class UserRole extends Model<InferAttributes<UserRole>, InferCreationAttributes<UserRole>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<number>;
  /** Código del rol (FK a Role.code). */
  declare role: RoleCode;
  declare schoolId: ForeignKey<number> | null;
  /** Limita el alcance a un nivel (ej: Rectora → Secundario). null = toda la institución. */
  declare levelId: ForeignKey<number | null>;
  /** Para preceptores: divisiones a cargo. Vacío = todo su nivel. */
  declare divisionIds: CreationOptional<number[]>;
  /** Cargo visible (ej: "Directora de Primaria"). */
  declare title: string | null;
  declare active: CreationOptional<boolean>;
  declare School?: NonAttribute<School>;
  declare Level?: NonAttribute<Level>;
}

UserRole.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    role: { type: DataTypes.STRING(40), allowNull: false, references: { model: 'Role', key: 'code' } },
    divisionIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    title: { type: DataTypes.STRING(80), allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'UserRole',
    tableName: 'UserRole',
    timestamps: true,
    indexes: [{ fields: ['userId', 'schoolId'] }, { fields: ['schoolId', 'role'] }],
  }
);

export default UserRole;
