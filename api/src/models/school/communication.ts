import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  NonAttribute,
  Op,
} from 'sequelize';
import { sequelize } from '../../config/database';
import { AudienceType, AudienceTarget, AnnouncementCategory } from '../../constants/school';

export interface Attachment {
  /** FileAsset (formato actual). */
  fileId?: number;
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
  /** SCHOOL/LEVEL/DIVISION/STUDENTS: familias, estudiantes (con cuenta) o ambos. Sin valor = FAMILIES. */
  target?: AudienceTarget;
  /** "Sumar más gente": personas puntuales además de la audiencia (colegas, familias o estudiantes del alcance). */
  extraUserIds?: number[];
  /** Comunicado personal de una familia o estudiante: sobre qué alumno escribe (contexto de las respuestas). */
  aboutStudentId?: number;
}

export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'SENT', 'ARCHIVED'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

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
  /** Tipo (ANNOUNCEMENT_CATEGORIES): institucional, académico, áulico, asistencia, convivencia… */
  declare category: CreationOptional<AnnouncementCategory>;
  /** Los destinatarios pueden responder. Cada respuesta abre una conversación privada SOLO con quien lo envió. */
  declare allowReplies: CreationOptional<boolean>;
  declare recipientCount: CreationOptional<number>;
  /** Borrador (solo lo ve el autor), programado (se envía solo), enviado o archivado (sale de la bandeja). */
  declare status: CreationOptional<AnnouncementStatus>;
  declare scheduledAt: CreationOptional<Date | null>;
  declare sentAt: CreationOptional<Date | null>;
  declare archivedAt: CreationOptional<Date | null>;
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
    category: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'INSTITUCIONAL' },
    allowReplies: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    recipientCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'SENT' },
    scheduledAt: { type: DataTypes.DATE, allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    archivedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Announcement',
    tableName: 'Announcement',
    indexes: [{ fields: ['schoolId', 'createdAt'] }, { fields: ['status', 'scheduledAt'] }, { name: 'announcement_author_created', fields: ['authorId', 'createdAt'] }],
  }
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

/**
 * Conversación privada. Dos orígenes:
 * - respuesta a un comunicado (announcementId): siempre entre quien lo envió y quien responde, una por persona;
 * - conversación iniciada directamente (anteriores y app móvil): familia/estudiante ↔ escuela sobre un alumno.
 */
export class Thread extends Model<InferAttributes<Thread>, InferCreationAttributes<Thread>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare studentId: ForeignKey<number | null>;
  /** Comunicado al que responde (null = conversación directa). Único por (announcementId, createdById). */
  declare announcementId: CreationOptional<number | null>;
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
    announcementId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Announcement', key: 'id' }, onDelete: 'CASCADE' },
    lastMessageAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    lastMessagePreview: { type: DataTypes.STRING(160), allowNull: false, defaultValue: '' },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Thread',
    tableName: 'Thread',
    updatedAt: false,
    indexes: [
      { fields: ['schoolId', 'lastMessageAt'] },
      // Una sola conversación por persona que responde un comunicado.
      { name: 'thread_announcement_creator', unique: true, fields: ['announcementId', 'createdById'], where: { announcementId: { [Op.ne]: null } } },
    ],
  }
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
