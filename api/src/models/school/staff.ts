import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../../config/database';
import type User from '../User';

export const POSITION_KINDS = ['CARGO', 'HORAS_CATEDRA', 'MODULOS'] as const;
export type PositionKind = (typeof POSITION_KINDS)[number];
export const POSITION_SITUATIONS = ['TITULAR', 'INTERINO', 'SUPLENTE', 'CONTRATADO'] as const;
export type PositionSituation = (typeof POSITION_SITUATIONS)[number];

/** Franja del horario semanal: día 1 (lunes) a 6 (sábado), horas "HH:MM". */
export interface ScheduleSlot {
  day: number;
  from: string;
  to: string;
  /** Opcional: materia o tarea de esa franja. */
  label?: string;
}

/**
 * Legajo del personal: cada cargo u horas que tiene una persona en el colegio (puede tener varios:
 * maestra de grado a la mañana y 8 horas cátedra de Inglés a la tarde).
 */
export class StaffPosition extends Model<InferAttributes<StaffPosition>, InferCreationAttributes<StaffPosition>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare userId: number;
  /** Cargo, ej: "Maestra de grado", "Profesor de Matemática", "Preceptor". */
  declare title: string;
  declare kind: PositionKind;
  declare situation: PositionSituation;
  declare weeklyHours: number;
  declare shift: string | null;
  declare levelId: number | null;
  declare startDate: string | null;
  declare endDate: string | null;
  declare schedule: CreationOptional<ScheduleSlot[]>;
  declare notes: string | null;
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare User?: NonAttribute<User>;
}

StaffPosition.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    title: { type: DataTypes.STRING(120), allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CARGO' },
    situation: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'TITULAR' },
    weeklyHours: { type: DataTypes.DECIMAL(5, 1), allowNull: false, defaultValue: 0, get() { return Number(this.getDataValue('weeklyHours')); } },
    shift: { type: DataTypes.STRING(30), allowNull: true },
    levelId: { type: DataTypes.INTEGER, allowNull: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    schedule: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    notes: { type: DataTypes.TEXT, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'StaffPosition', tableName: 'StaffPosition', indexes: [{ fields: ['schoolId', 'userId'] }] }
);

export const RECEIPT_KINDS = ['SUELDO', 'AGUINALDO', 'VACACIONES', 'OTRO'] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

/** Recibo de sueldo digital: administración sube el PDF, la persona lo ve y deja su conformidad. */
export class PayrollReceipt extends Model<InferAttributes<PayrollReceipt>, InferCreationAttributes<PayrollReceipt>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare userId: number;
  /** 'YYYY-MM' */
  declare period: string;
  declare kind: ReceiptKind;
  declare fileId: number;
  declare netAmount: number | null;
  declare uploadedById: number;
  declare viewedAt: Date | null;
  /** Conformidad: fecha y si está de acuerdo (con observación en caso contrario). */
  declare acknowledgedAt: Date | null;
  declare agreed: boolean | null;
  declare observation: string | null;
  declare createdAt: CreationOptional<Date>;
  declare User?: NonAttribute<User>;
}

PayrollReceipt.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    period: { type: DataTypes.STRING(7), allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'SUELDO' },
    fileId: { type: DataTypes.INTEGER, allowNull: false },
    netAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: true, get() { const v = this.getDataValue('netAmount'); return v === null ? null : Number(v); } },
    uploadedById: { type: DataTypes.INTEGER, allowNull: false },
    viewedAt: { type: DataTypes.DATE, allowNull: true },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: true },
    agreed: { type: DataTypes.BOOLEAN, allowNull: true },
    observation: { type: DataTypes.STRING(1000), allowNull: true },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'PayrollReceipt',
    tableName: 'PayrollReceipt',
    updatedAt: false,
    indexes: [{ fields: ['schoolId', 'period'] }, { fields: ['schoolId', 'userId'] }, { unique: true, fields: ['schoolId', 'userId', 'period', 'kind'] }],
  }
);
