import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../../config/database';
import type User from '../User';

export const EVENT_KINDS = ['ACTO', 'FERIADO', 'NO_LABORABLE', 'EVENTO', 'REUNION', 'SALIDA', 'OTRO'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** STAFF: solo el personal. COMMUNITY: también familias y estudiantes de los niveles/cursos indicados. */
export const EVENT_AUDIENCES = ['STAFF', 'COMMUNITY'] as const;
export type EventAudience = (typeof EVENT_AUDIENCES)[number];

/** Evento del calendario institucional: acto, feriado, reunión, salida… */
export class SchoolEvent extends Model<InferAttributes<SchoolEvent>, InferCreationAttributes<SchoolEvent>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare title: string;
  declare kind: EventKind;
  declare date: string;
  /** Eventos de varios días (ej: receso). */
  declare endDate: string | null;
  declare startTime: string | null;
  declare endTime: string | null;
  declare location: string | null;
  declare description: CreationOptional<string>;
  /** Vacío = todos los niveles. */
  declare levelIds: CreationOptional<number[]>;
  /** Vacío = todas las divisiones de esos niveles. */
  declare divisionIds: CreationOptional<number[]>;
  declare audience: CreationOptional<EventAudience>;
  /** Clave del feriado nacional del que salió (para no importarlo dos veces). */
  declare holidayKey: string | null;
  declare createdById: number;
  declare cancelled: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Managers?: NonAttribute<EventManager[]>;
}

SchoolEvent.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    title: { type: DataTypes.STRING(160), allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    startTime: { type: DataTypes.STRING(5), allowNull: true },
    endTime: { type: DataTypes.STRING(5), allowNull: true },
    location: { type: DataTypes.STRING(160), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    levelIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    divisionIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    audience: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'COMMUNITY' },
    holidayKey: { type: DataTypes.STRING(40), allowNull: true },
    createdById: { type: DataTypes.INTEGER, allowNull: false },
    cancelled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'SchoolEvent', tableName: 'SchoolEvent', indexes: [{ fields: ['schoolId', 'date'] }, { fields: ['schoolId', 'holidayKey'] }] }
);

/** Encargado/a de un acto o evento: tiene acceso a su espacio de trabajo. */
export class EventManager extends Model<InferAttributes<EventManager>, InferCreationAttributes<EventManager>> {
  declare id: CreationOptional<number>;
  declare eventId: number;
  declare userId: number;
  /** Qué tiene a cargo, ej: "Coordinación", "Música", "Escenografía". */
  declare task: string | null;
  declare User?: NonAttribute<User>;
}

EventManager.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'SchoolEvent', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    task: { type: DataTypes.STRING(120), allowNull: true },
  },
  { sequelize, modelName: 'EventManager', tableName: 'EventManager', timestamps: false, indexes: [{ unique: true, fields: ['eventId', 'userId'] }, { fields: ['userId'] }] }
);

export const EVENT_POST_KINDS = ['NOTA', 'TAREA', 'ARCHIVO', 'LINK'] as const;
export type EventPostKind = (typeof EVENT_POST_KINDS)[number];

/** Lo que los encargados vuelcan en el espacio del acto: guion, tareas, música, fotos, links. */
export class EventPost extends Model<InferAttributes<EventPost>, InferCreationAttributes<EventPost>> {
  declare id: CreationOptional<number>;
  declare eventId: number;
  declare authorId: number;
  declare kind: EventPostKind;
  declare body: CreationOptional<string>;
  declare url: string | null;
  declare fileIds: CreationOptional<number[]>;
  /** Tareas: a quién le toca, para cuándo y si está hecha. */
  declare assigneeId: number | null;
  declare dueDate: string | null;
  declare done: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Author?: NonAttribute<User>;
}

EventPost.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'SchoolEvent', key: 'id' }, onDelete: 'CASCADE' },
    authorId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    kind: { type: DataTypes.STRING(10), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    url: { type: DataTypes.STRING(500), allowNull: true },
    fileIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    assigneeId: { type: DataTypes.INTEGER, allowNull: true },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    done: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'EventPost', tableName: 'EventPost', indexes: [{ fields: ['eventId', 'createdAt'] }] }
);
