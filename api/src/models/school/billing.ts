import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Período en que una persona tuvo acceso a un colegio (personal, familia o estudiante).
 * Se abre al ganar acceso y se CIERRA (endedAt) al perderlo: nunca se borra. Es la base auditable
 * de la facturación: se cobra a quien tuvo al menos un período que se superpone con el ciclo.
 */
export class AccessPeriod extends Model<InferAttributes<AccessPeriod>, InferCreationAttributes<AccessPeriod>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare userId: number;
  /** DIRECTIVO | DOCENTE | FAMILIA | ESTUDIANTE (la más alta mientras duró el período). */
  declare category: string;
  declare startedAt: Date;
  declare endedAt: Date | null;
}

AccessPeriod.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    category: { type: DataTypes.STRING(20), allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    endedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AccessPeriod',
    tableName: 'AccessPeriod',
    timestamps: false,
    indexes: [{ fields: ['schoolId', 'startedAt'] }, { fields: ['schoolId', 'userId'] }],
  }
);

/** Liquidación cerrada de un ciclo (mes): se congela con el precio vigente para que sea auditable. */
export class BillingStatement extends Model<InferAttributes<BillingStatement>, InferCreationAttributes<BillingStatement>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  /** 'YYYY-MM' */
  declare cycle: string;
  declare unitPrice: number;
  declare currency: string;
  declare billableUsers: number;
  declare total: number;
  declare lines: object;
  declare closedAt: Date;
}

BillingStatement.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    cycle: { type: DataTypes.STRING(7), allowNull: false },
    unitPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, get() { return Number(this.getDataValue('unitPrice')); } },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'ARS' },
    billableUsers: { type: DataTypes.INTEGER, allowNull: false },
    total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, get() { return Number(this.getDataValue('total')); } },
    lines: { type: DataTypes.JSONB, allowNull: false },
    closedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, modelName: 'BillingStatement', tableName: 'BillingStatement', timestamps: false, indexes: [{ unique: true, fields: ['schoolId', 'cycle'] }] }
);
