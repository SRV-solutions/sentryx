import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Registro inmutable de cambios sensibles (notas, asistencia, roles, blanqueos, ingresos…):
 * qué cambió, quién, cuándo y desde qué IP. Se escribe con services/audit.ts.
 */
export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>;
  declare schoolId: number | null;
  declare userId: number | null;
  declare entity: string;
  declare entityId: number | null;
  declare action: string;
  declare before: object | null;
  declare after: object | null;
  declare ip: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
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
    ip: { type: DataTypes.STRING(64), allowNull: true },
    userAgent: { type: DataTypes.STRING(300), allowNull: true },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'AuditLog',
    updatedAt: false,
    indexes: [{ fields: ['schoolId', 'entity', 'entityId'] }, { fields: ['schoolId', 'createdAt'] }, { fields: ['userId', 'createdAt'] }],
  }
);

/**
 * Actividad: cada pedido que MODIFICA algo (POST/PUT/PATCH/DELETE) con usuario, colegio, IP, resultado y
 * duración. No guarda el contenido (privacidad): para el detalle de un cambio está AuditLog.
 */
export class ActivityLog extends Model<InferAttributes<ActivityLog>, InferCreationAttributes<ActivityLog>> {
  declare id: CreationOptional<number>;
  declare userId: number | null;
  declare schoolId: number | null;
  declare method: string;
  /** Ruta pedida, ej: /school/students/12. */
  declare path: string;
  declare statusCode: number;
  declare ip: string | null;
  declare userAgent: string | null;
  declare durationMs: number;
  declare createdAt: CreationOptional<Date>;
}

ActivityLog.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: true },
    method: { type: DataTypes.STRING(8), allowNull: false },
    path: { type: DataTypes.STRING(300), allowNull: false },
    statusCode: { type: DataTypes.SMALLINT, allowNull: false },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    userAgent: { type: DataTypes.STRING(300), allowNull: true },
    durationMs: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'ActivityLog',
    tableName: 'ActivityLog',
    updatedAt: false,
    indexes: [{ fields: ['schoolId', 'createdAt'] }, { fields: ['userId', 'createdAt'] }, { fields: ['ip'] }],
  }
);

export const SUPPORT_REPORT_CATEGORIES = ['ERROR', 'SUGERENCIA', 'CONSULTA'] as const;
export const SUPPORT_REPORT_STATUSES = ['ABIERTO', 'EN_PROCESO', 'RESUELTO', 'DESCARTADO'] as const;
export type SupportReportCategory = (typeof SUPPORT_REPORT_CATEGORIES)[number];
export type SupportReportStatus = (typeof SUPPORT_REPORT_STATUSES)[number];

/** Problema o sugerencia que manda un usuario desde la app ("Reportar un problema"). */
export class SupportReport extends Model<InferAttributes<SupportReport>, InferCreationAttributes<SupportReport>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare schoolId: number | null;
  declare category: SupportReportCategory;
  declare description: string;
  /** Pantalla donde estaba al reportar. */
  declare pageUrl: string | null;
  declare userAgent: string | null;
  declare ip: string | null;
  /** Últimos errores de la app en ese navegador (se adjuntan solos para facilitar el diagnóstico). */
  declare clientErrors: CreationOptional<object[]>;
  declare status: CreationOptional<SupportReportStatus>;
  /** Respuesta del equipo de soporte (la ve quien reportó). */
  declare response: string | null;
  declare resolvedById: number | null;
  declare resolvedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SupportReport.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    schoolId: { type: DataTypes.INTEGER, allowNull: true },
    category: { type: DataTypes.STRING(20), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    pageUrl: { type: DataTypes.STRING(500), allowNull: true },
    userAgent: { type: DataTypes.STRING(300), allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    clientErrors: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ABIERTO' },
    response: { type: DataTypes.TEXT, allowNull: true },
    resolvedById: { type: DataTypes.INTEGER, allowNull: true },
    resolvedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'SupportReport', tableName: 'SupportReport', indexes: [{ fields: ['status', 'createdAt'] }, { fields: ['userId'] }] }
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

/**
 * Foto de perfil. Se guarda chica (máx. ~384 px, JPEG/WebP, < 200 KB) directamente en la base:
 * 750 cuentas ≈ 20 MB, sin depender del bucket. Se sirve en GET /avatars/:token con caché inmutable
 * (el token cambia en cada subida, así que nunca se ve una foto vieja).
 */
export class UserAvatar extends Model<InferAttributes<UserAvatar>, InferCreationAttributes<UserAvatar>> {
  declare userId: number;
  declare token: string;
  declare mimeType: string;
  declare data: Buffer;
  declare updatedAt: CreationOptional<Date>;
}

UserAvatar.init(
  {
    userId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'User', key: 'id' }, onDelete: 'CASCADE' },
    token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    mimeType: { type: DataTypes.STRING(40), allowNull: false },
    data: { type: DataTypes.BLOB, allowNull: false },
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'UserAvatar', tableName: 'UserAvatar', createdAt: false }
);
