import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey } from 'sequelize';
import { sequelize } from '../../config/database';

/** Registro inmutable de cambios sensibles (notas, asistencia, roles, publicaciones). */
export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>;
  declare schoolId: number | null;
  declare userId: number | null;
  declare entity: string;
  declare entityId: number | null;
  declare action: string;
  declare before: object | null;
  declare after: object | null;
  declare createdAt: CreationOptional<Date>;
}

AuditLog.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    entity: { type: DataTypes.STRING(40), allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(40), allowNull: false },
    before: { type: DataTypes.JSONB, allowNull: true },
    after: { type: DataTypes.JSONB, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'AuditLog',
    updatedAt: false,
    indexes: [{ fields: ['schoolId', 'entity', 'entityId'] }],
  }
);

/** Suscripciones push del navegador (PWA) y, más adelante, tokens de la app React Native (Expo). */
export class DeviceToken extends Model<InferAttributes<DeviceToken>, InferCreationAttributes<DeviceToken>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<number>;
  declare kind: 'WEBPUSH' | 'EXPO';
  /** endpoint (webpush) o token (expo). */
  declare token: string;
  declare data: object | null;
  declare lastSeenAt: CreationOptional<Date>;
}

DeviceToken.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    kind: { type: DataTypes.ENUM('WEBPUSH', 'EXPO'), allowNull: false },
    token: { type: DataTypes.TEXT, allowNull: false, unique: true },
    data: { type: DataTypes.JSONB, allowNull: true },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'DeviceToken', tableName: 'DeviceToken', timestamps: false, indexes: [{ fields: ['userId'] }] }
);
