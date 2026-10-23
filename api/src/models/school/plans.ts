import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../../config/database';
import type { PlanCode } from '../../constants/plans';
import type User from '../User';

/**
 * Plan de una persona en un colegio, con historial: cambiar de plan CIERRA el período vigente
 * (endedAt) y abre otro. Nunca se borra: es la base auditable de lo que se cobra cada mes.
 * Quien no tiene período abierto está en el plan Básico.
 */
export class PlanAssignment extends Model<InferAttributes<PlanAssignment>, InferCreationAttributes<PlanAssignment>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare userId: number;
  declare plan: PlanCode;
  declare startedAt: Date;
  declare endedAt: Date | null;
  declare changedById: number | null;
}

PlanAssignment.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    plan: { type: DataTypes.STRING(20), allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    changedById: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    modelName: 'PlanAssignment',
    tableName: 'PlanAssignment',
    timestamps: false,
    indexes: [{ fields: ['schoolId', 'userId', 'endedAt'] }, { fields: ['schoolId', 'startedAt'] }],
  }
);

export const PLAN_REQUEST_STATUSES = ['PENDIENTE', 'APROBADA', 'RECHAZADA'] as const;
export type PlanRequestStatus = (typeof PLAN_REQUEST_STATUSES)[number];

/** Pedido de una persona para subir de plan. Lo resuelve la Representante Legal. */
export interface PlanRequestContext { kind: 'storage'; fileName?: string; fileSize?: number; used?: number; limit?: number }

export class PlanRequest extends Model<InferAttributes<PlanRequest>, InferCreationAttributes<PlanRequest>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare userId: number;
  declare plan: PlanCode;
  declare note: string | null;
  declare status: CreationOptional<PlanRequestStatus>;
  declare resolvedById: number | null;
  declare resolvedAt: Date | null;
  /** Quiénes lo pueden resolver además de la Representante Legal (conducción del nivel de quien pide). */
  declare approverIds: CreationOptional<number[]>;
  /** Por qué se pidió: { kind: 'storage', fileName, fileSize, used, limit }. */
  declare context: CreationOptional<PlanRequestContext | null>;
  declare createdAt: CreationOptional<Date>;
  declare User?: NonAttribute<User>;
}

PlanRequest.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    plan: { type: DataTypes.STRING(20), allowNull: false },
    note: { type: DataTypes.STRING(500), allowNull: true },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'PENDIENTE' },
    resolvedById: { type: DataTypes.INTEGER, allowNull: true },
    resolvedAt: { type: DataTypes.DATE, allowNull: true },
    approverIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    context: { type: DataTypes.JSONB, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'PlanRequest', tableName: 'PlanRequest', updatedAt: false, indexes: [{ fields: ['schoolId', 'status'] }] }
);
