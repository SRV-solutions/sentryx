import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../../config/database';
import type { Attachment } from './communication';

/**
 * Canal de curso (Secundario): uno "General" por división y uno por cada materia que se dicta en ella.
 * Participan los estudiantes con cuenta de esa división y sus docentes. Preceptoría y conducción lo
 * ven y moderan. No hay mensajes privados entre estudiantes.
 */
export class Channel extends Model<InferAttributes<Channel>, InferCreationAttributes<Channel>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare divisionId: number;
  /** null = canal General de la división. */
  declare subjectId: number | null;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
}

Channel.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    divisionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Division', key: 'id' }, onDelete: 'CASCADE' },
    subjectId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Subject', key: 'id' } },
    name: { type: DataTypes.STRING(120), allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'Channel', tableName: 'Channel', updatedAt: false, indexes: [{ fields: ['divisionId'] }] }
);

export class ChannelMessage extends Model<InferAttributes<ChannelMessage>, InferCreationAttributes<ChannelMessage>> {
  declare id: CreationOptional<number>;
  declare channelId: number;
  declare senderId: number;
  declare body: string;
  declare attachments: CreationOptional<Attachment[]>;
  /** Moderación: oculto para los estudiantes (el registro se conserva). */
  declare hiddenAt: CreationOptional<Date | null>;
  declare hiddenById: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare Sender?: NonAttribute<{ id: number; firstName: string; lastName: string; avatar: string | null }>;
}

ChannelMessage.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    channelId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Channel', key: 'id' }, onDelete: 'CASCADE' },
    senderId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    body: { type: DataTypes.TEXT, allowNull: false },
    attachments: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    hiddenAt: { type: DataTypes.DATE, allowNull: true },
    hiddenById: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'ChannelMessage', tableName: 'ChannelMessage', updatedAt: false, indexes: [{ fields: ['channelId', 'id'] }] }
);

export class ChannelRead extends Model<InferAttributes<ChannelRead>, InferCreationAttributes<ChannelRead>> {
  declare channelId: number;
  declare userId: number;
  declare lastReadAt: Date;
}

ChannelRead.init(
  {
    channelId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'Channel', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'User', key: 'id' } },
    lastReadAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, modelName: 'ChannelRead', tableName: 'ChannelRead', timestamps: false }
);

/** Silencio temporal de un estudiante en un canal (lo aplica un docente o preceptoría). */
export class ChannelMute extends Model<InferAttributes<ChannelMute>, InferCreationAttributes<ChannelMute>> {
  declare id: CreationOptional<number>;
  declare channelId: number;
  declare userId: number;
  declare mutedById: number;
  declare until: Date;
  declare reason: string | null;
  declare createdAt: CreationOptional<Date>;
}

ChannelMute.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    channelId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Channel', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    mutedById: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    until: { type: DataTypes.DATE, allowNull: false },
    reason: { type: DataTypes.STRING(200), allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'ChannelMute', tableName: 'ChannelMute', updatedAt: false, indexes: [{ fields: ['channelId', 'userId'] }] }
);
