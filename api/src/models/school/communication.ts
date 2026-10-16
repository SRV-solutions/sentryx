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
import { AudienceType } from '../../school/constants';

export interface Attachment {
  name: string;
  url: string;
  size?: number;
  type?: string;
}

export interface Audience {
  type: AudienceType;
  /** ids de nivel/división/alumno según el tipo. Vacío para SCHOOL/STAFF. */
  ids: number[];
  /** Incluir también al personal de ese alcance. */
  includeStaff?: boolean;
}

export class Announcement extends Model<InferAttributes<Announcement>, InferCreationAttributes<Announcement>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare authorId: ForeignKey<number>;
  declare title: string;
  declare body: string;
  declare audience: Audience;
  /** Texto legible del destinatario (ej: "3º B · Secundario") para no recalcularlo al listar. */
  declare audienceLabel: string;
  declare attachments: CreationOptional<Attachment[]>;
  declare requiresAck: CreationOptional<boolean>;
  declare priority: CreationOptional<'NORMAL' | 'URGENT'>;
  declare recipientCount: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Announcement.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(160), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    audience: { type: DataTypes.JSONB, allowNull: false },
    audienceLabel: { type: DataTypes.STRING(200), allowNull: false },
    attachments: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    requiresAck: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    priority: { type: DataTypes.ENUM('NORMAL', 'URGENT'), allowNull: false, defaultValue: 'NORMAL' },
    recipientCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'Announcement', tableName: 'Announcement', indexes: [{ fields: ['schoolId', 'createdAt'] }] }
);

/** Destinatario materializado: permite bandeja por usuario y "quién leyó / quién confirmó" en una consulta. */
export class AnnouncementRecipient extends Model<
  InferAttributes<AnnouncementRecipient>,
  InferCreationAttributes<AnnouncementRecipient>
> {
  declare id: CreationOptional<number>;
  declare announcementId: ForeignKey<Announcement['id']>;
  declare userId: ForeignKey<number>;
  /** Alumnos por los que esta familia recibe el comunicado (contexto en la bandeja). */
  declare studentIds: CreationOptional<number[]>;
  declare readAt: Date | null;
  declare ackAt: Date | null;
  declare Announcement?: NonAttribute<Announcement>;
}

AnnouncementRecipient.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    readAt: { type: DataTypes.DATE, allowNull: true },
    ackAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AnnouncementRecipient',
    tableName: 'AnnouncementRecipient',
    timestamps: false,
    indexes: [{ unique: true, fields: ['announcementId', 'userId'] }, { fields: ['userId', 'readAt'] }],
  }
);

/** Conversación familia ↔ institución, siempre en el contexto de un alumno. */
export class Thread extends Model<InferAttributes<Thread>, InferCreationAttributes<Thread>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare studentId: ForeignKey<number | null>;
  declare subject: string;
  declare createdById: ForeignKey<number>;
  declare lastMessageAt: CreationOptional<Date>;
  declare lastMessagePreview: CreationOptional<string>;
  declare closedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare Participants?: NonAttribute<ThreadParticipant[]>;
}

Thread.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    subject: { type: DataTypes.STRING(160), allowNull: false },
    lastMessageAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    lastMessagePreview: { type: DataTypes.STRING(160), allowNull: false, defaultValue: '' },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'Thread', tableName: 'Thread', updatedAt: false, indexes: [{ fields: ['schoolId', 'lastMessageAt'] }] }
);

export class ThreadParticipant extends Model<InferAttributes<ThreadParticipant>, InferCreationAttributes<ThreadParticipant>> {
  declare id: CreationOptional<number>;
  declare threadId: ForeignKey<Thread['id']>;
  declare userId: ForeignKey<number>;
  /** Etiqueta del rol con el que participa (ej: "Docente · Matemática", "Familia"). */
  declare roleLabel: string;
  declare lastReadAt: Date | null;
  declare Thread?: NonAttribute<Thread>;
}

ThreadParticipant.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    roleLabel: { type: DataTypes.STRING(120), allowNull: false },
    lastReadAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ThreadParticipant',
    tableName: 'ThreadParticipant',
    timestamps: false,
    indexes: [{ unique: true, fields: ['threadId', 'userId'] }, { fields: ['userId'] }],
  }
);

export class ThreadMessage extends Model<InferAttributes<ThreadMessage>, InferCreationAttributes<ThreadMessage>> {
  declare id: CreationOptional<number>;
  declare threadId: ForeignKey<Thread['id']>;
  declare senderId: ForeignKey<number>;
  declare body: string;
  declare attachments: CreationOptional<Attachment[]>;
  declare createdAt: CreationOptional<Date>;
}

ThreadMessage.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    attachments: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'ThreadMessage', tableName: 'ThreadMessage', updatedAt: false, indexes: [{ fields: ['threadId', 'id'] }] }
);
