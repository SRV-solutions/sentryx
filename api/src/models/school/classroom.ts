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

/** PAYROLL: recibos de sueldo (solo los ve la persona y administración). EVENT y PROGRAM: espacio de un acto y programas. */
export const FILE_PURPOSES = ['MATERIAL', 'ANNOUNCEMENT', 'MESSAGE', 'OTHER', 'PAYROLL', 'EVENT', 'PROGRAM'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/**
 * Archivo subido por el personal (o familias en mensajes). Registro central para gestionar
 * almacenamiento: quién subió qué, cuánto ocupa, en qué aula, y poder borrarlo del bucket.
 */
export class FileAsset extends Model<InferAttributes<FileAsset>, InferCreationAttributes<FileAsset>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare uploaderId: ForeignKey<number>;
  declare divisionId: ForeignKey<number | null>;
  declare subjectId: ForeignKey<number | null>;
  declare purpose: FilePurpose;
  declare key: string;
  declare name: string;
  declare mimeType: string;
  /** Bytes confirmados en el bucket (no lo que declara el navegador). */
  declare size: number;
  declare status: CreationOptional<'PENDING' | 'READY'>;
  declare createdAt: CreationOptional<Date>;
}

FileAsset.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    purpose: { type: DataTypes.ENUM(...FILE_PURPOSES), allowNull: false },
    key: { type: DataTypes.STRING(600), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    mimeType: { type: DataTypes.STRING(120), allowNull: false },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      get() {
        return Number(this.getDataValue('size') ?? 0);
      },
    },
    status: { type: DataTypes.ENUM('PENDING', 'READY'), allowNull: false, defaultValue: 'PENDING' },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'FileAsset',
    tableName: 'FileAsset',
    updatedAt: false,
    indexes: [{ fields: ['schoolId', 'uploaderId'] }, { fields: ['divisionId'] }, { fields: ['status', 'createdAt'] }],
  }
);

export interface PostLink {
  url: string;
  title?: string;
}

/** Publicación del aula: material de estudio (archivos, videos, links) o tarea con fecha de entrega. */
export class ClassroomPost extends Model<InferAttributes<ClassroomPost>, InferCreationAttributes<ClassroomPost>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare divisionId: ForeignKey<number>;
  declare subjectId: ForeignKey<number | null>;
  declare authorId: ForeignKey<number>;
  declare kind: 'MATERIAL' | 'TAREA';
  declare title: string;
  declare body: CreationOptional<string>;
  declare links: CreationOptional<PostLink[]>;
  declare fileIds: CreationOptional<number[]>;
  declare dueDate: string | null;
  declare pinned: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Files?: NonAttribute<FileAsset[]>;
}

ClassroomPost.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    kind: { type: DataTypes.ENUM('MATERIAL', 'TAREA'), allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    links: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    fileIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'ClassroomPost',
    tableName: 'ClassroomPost',
    indexes: [{ fields: ['divisionId', 'createdAt'] }],
  }
);
