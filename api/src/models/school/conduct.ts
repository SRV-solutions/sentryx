import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../../config/database';
import type User from '../User';
import type { ConductKind } from '../../constants/school';

/**
 * Convivencia: historial del alumno (qué pasó y cuándo). Lo cargan docentes, preceptoría, rectoría o coordinación
 * pedagógica (permiso conduct:create). NO se edita ni se borra: la base lo impide con un trigger (ver migración
 * 2026-10-28-comunicados-convivencia). Un error se corrige con otro registro de tipo RECTIFICACION (refId).
 */
export class ConductRecord extends Model<InferAttributes<ConductRecord>, InferCreationAttributes<ConductRecord>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare studentId: number;
  /** Ciclo y curso del alumno al momento del hecho (para el historial de años anteriores). */
  declare academicYearId: number | null;
  declare divisionId: number | null;
  /** Día del hecho (puede ser anterior a la carga). */
  declare occurredOn: string;
  declare kind: ConductKind;
  /** Amonestaciones: cuántas. Suspensión: días. El resto: null. */
  declare quantity: number | null;
  /** Materia/hora en la que pasó, si corresponde. */
  declare subjectId: number | null;
  /** Qué pasó. */
  declare description: string;
  /** Medida o acuerdo tomado. */
  declare measures: string | null;
  /** Lo ven la familia y el estudiante (false = solo el personal). */
  declare visibleToFamily: CreationOptional<boolean>;
  /** Rectificación: registro al que corrige. */
  declare refId: number | null;
  /** Cuándo se avisó a la familia (null = no se avisó). */
  declare notifiedAt: Date | null;
  declare createdById: number;
  declare createdAt: CreationOptional<Date>;
  declare CreatedBy?: NonAttribute<User>;
}

ConductRecord.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Student', key: 'id' }, onDelete: 'CASCADE' },
    academicYearId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'AcademicYear', key: 'id' }, onDelete: 'SET NULL' },
    divisionId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Division', key: 'id' }, onDelete: 'SET NULL' },
    occurredOn: { type: DataTypes.DATEONLY, allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false },
    quantity: { type: DataTypes.SMALLINT, allowNull: true },
    subjectId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Subject', key: 'id' }, onDelete: 'SET NULL' },
    description: { type: DataTypes.TEXT, allowNull: false },
    measures: { type: DataTypes.TEXT, allowNull: true },
    visibleToFamily: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    refId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'ConductRecord', key: 'id' }, onDelete: 'CASCADE' },
    notifiedAt: { type: DataTypes.DATE, allowNull: true },
    createdById: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'ConductRecord',
    tableName: 'ConductRecord',
    updatedAt: false,
    indexes: [
      { name: 'conduct_student_occurred', fields: ['studentId', 'occurredOn'] },
      { name: 'conduct_school_created', fields: ['schoolId', 'createdAt'] },
      { name: 'conduct_ref', fields: ['refId'] },
    ],
  }
);
