import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../../config/database';
import type User from '../User';

/**
 * Ausencia de un/a docente: un día (o varios) completo o una franja horaria. Las ven los estudiantes y
 * las familias de los cursos donde dicta (en el aula y en el calendario) y les llega una notificación.
 */
export class TeacherAbsence extends Model<InferAttributes<TeacherAbsence>, InferCreationAttributes<TeacherAbsence>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare teacherId: number;
  declare date: string;
  /** Último día, si son varios (vacío = un solo día). */
  declare endDate: string | null;
  /** Franja (vacía = todo el día). */
  declare fromTime: string | null;
  declare toTime: string | null;
  /** Cursos afectados (los que dicta ese día). */
  declare divisionIds: CreationOptional<number[]>;
  declare note: CreationOptional<string>;
  /** Quién la reemplaza, si hay reemplazo (ej: "Prof. Gómez" u "Hora libre"). */
  declare substitute: string | null;
  declare createdById: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Teacher?: NonAttribute<User>;
}

TeacherAbsence.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' }, onDelete: 'CASCADE' },
    teacherId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' }, onDelete: 'CASCADE' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    fromTime: { type: DataTypes.STRING(5), allowNull: true },
    toTime: { type: DataTypes.STRING(5), allowNull: true },
    divisionIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    note: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    substitute: { type: DataTypes.STRING(120), allowNull: true },
    createdById: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'TeacherAbsence', tableName: 'TeacherAbsence', indexes: [{ fields: ['schoolId', 'date'] }, { fields: ['teacherId'] }] }
);
