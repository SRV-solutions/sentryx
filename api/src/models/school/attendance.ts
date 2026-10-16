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
import {
  AttendanceStatus,
  ATTENDANCE_STATUSES,
  AlertRuleType,
  ALERT_RULE_TYPES,
  Severity,
  SEVERITIES,
} from '../../school/constants';
import type { Student } from './people';

export class Attendance extends Model<InferAttributes<Attendance>, InferCreationAttributes<Attendance>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare studentId: ForeignKey<number>;
  declare divisionId: ForeignKey<number>;
  declare date: string;
  declare status: AttendanceStatus;
  /** Valor en faltas según la configuración del nivel al momento de cargar. */
  declare value: number;
  declare justified: CreationOptional<boolean>;
  declare note: string | null;
  declare recordedById: ForeignKey<number>;
  declare updatedAt: CreationOptional<Date>;
}

Attendance.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM(...ATTENDANCE_STATUSES), allowNull: false },
    value: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        return Number(this.getDataValue('value') ?? 0);
      },
    },
    justified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    note: { type: DataTypes.STRING(300), allowNull: true },
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Attendance',
    tableName: 'Attendance',
    createdAt: false,
    indexes: [
      { unique: true, fields: ['studentId', 'date'] },
      { fields: ['divisionId', 'date'] },
    ],
  }
);

/** Regla configurable que dispara alertas (la normativa se carga como reglas, sin tocar código). */
export class AttendanceRule extends Model<InferAttributes<AttendanceRule>, InferCreationAttributes<AttendanceRule>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  /** null = aplica a todos los niveles. */
  declare levelId: ForeignKey<number | null>;
  declare name: string;
  declare type: AlertRuleType;
  declare threshold: number;
  /** Solo para WINDOW: cantidad de días hacia atrás. */
  declare windowDays: number | null;
  declare countJustified: CreationOptional<boolean>;
  declare severity: Severity;
  declare notifyGuardians: CreationOptional<boolean>;
  declare active: CreationOptional<boolean>;
}

AttendanceRule.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    type: { type: DataTypes.ENUM(...ALERT_RULE_TYPES), allowNull: false },
    threshold: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      get() {
        return Number(this.getDataValue('threshold'));
      },
    },
    windowDays: { type: DataTypes.INTEGER, allowNull: true },
    countJustified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    severity: { type: DataTypes.ENUM(...SEVERITIES), allowNull: false },
    notifyGuardians: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, modelName: 'AttendanceRule', tableName: 'AttendanceRule', timestamps: true }
);

export class Alert extends Model<InferAttributes<Alert>, InferCreationAttributes<Alert>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare studentId: ForeignKey<number>;
  declare ruleId: ForeignKey<AttendanceRule['id']>;
  declare severity: Severity;
  declare message: string;
  declare value: number;
  declare status: CreationOptional<'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'>;
  declare note: string | null;
  declare handledById: ForeignKey<number | null>;
  declare handledAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Student?: NonAttribute<Student>;
  declare AttendanceRule?: NonAttribute<AttendanceRule>;
}

Alert.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    severity: { type: DataTypes.ENUM(...SEVERITIES), allowNull: false },
    message: { type: DataTypes.STRING(300), allowNull: false },
    value: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      get() {
        return Number(this.getDataValue('value'));
      },
    },
    status: { type: DataTypes.ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED'), allowNull: false, defaultValue: 'OPEN' },
    note: { type: DataTypes.STRING(500), allowNull: true },
    handledAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Alert',
    tableName: 'Alert',
    indexes: [{ fields: ['schoolId', 'status'] }, { fields: ['studentId', 'ruleId'] }],
  }
);
