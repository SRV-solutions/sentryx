import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../../config/database';
import { PeriodKind, PERIOD_KINDS } from '../../school/constants';

/** Período de calificación de un nivel en un ciclo lectivo (bimestre, trimestre, informe). */
export class GradingPeriod extends Model<InferAttributes<GradingPeriod>, InferCreationAttributes<GradingPeriod>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare levelId: ForeignKey<number>;
  declare academicYearId: ForeignKey<number>;
  declare name: string;
  /** Agrupador opcional (ej: "1º Cuatrimestre"). */
  declare groupName: string | null;
  declare kind: PeriodKind;
  declare order: number;
  declare startDate: string | null;
  declare endDate: string | null;
  /** Cerrado: los docentes ya no pueden modificar notas. */
  declare closedAt: Date | null;
}

GradingPeriod.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
    groupName: { type: DataTypes.STRING(60), allowNull: true },
    kind: { type: DataTypes.ENUM(...PERIOD_KINDS), allowNull: false },
    order: { type: DataTypes.INTEGER, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    closedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'GradingPeriod',
    tableName: 'GradingPeriod',
    timestamps: false,
    indexes: [{ fields: ['levelId', 'academicYearId'] }],
  }
);

export class Grade extends Model<InferAttributes<Grade>, InferCreationAttributes<Grade>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare studentId: ForeignKey<number>;
  declare subjectId: ForeignKey<number>;
  declare divisionId: ForeignKey<number>;
  declare periodId: ForeignKey<GradingPeriod['id']>;
  declare numericValue: number | null;
  declare conceptualValue: string | null;
  declare narrative: string | null;
  declare observation: string | null;
  declare updatedById: ForeignKey<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare GradingPeriod?: NonAttribute<GradingPeriod>;
}

Grade.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    numericValue: {
      type: DataTypes.DECIMAL(4, 2),
      allowNull: true,
      get() {
        const v = this.getDataValue('numericValue');
        return v === null || v === undefined ? null : Number(v);
      },
    },
    conceptualValue: { type: DataTypes.STRING(40), allowNull: true },
    narrative: { type: DataTypes.TEXT, allowNull: true },
    observation: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Grade',
    tableName: 'Grade',
    indexes: [
      { unique: true, fields: ['studentId', 'subjectId', 'periodId'] },
      { fields: ['divisionId', 'subjectId', 'periodId'] },
    ],
  }
);

/** Publicación del boletín de un período para una división: recién ahí las familias ven las notas. */
export class ReportCardPublication extends Model<
  InferAttributes<ReportCardPublication>,
  InferCreationAttributes<ReportCardPublication>
> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare divisionId: ForeignKey<number>;
  declare periodId: ForeignKey<GradingPeriod['id']>;
  declare publishedById: ForeignKey<number>;
  declare publishedAt: CreationOptional<Date>;
}

ReportCardPublication.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    publishedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'ReportCardPublication',
    tableName: 'ReportCardPublication',
    timestamps: false,
    indexes: [{ unique: true, fields: ['divisionId', 'periodId'] }],
  }
);
