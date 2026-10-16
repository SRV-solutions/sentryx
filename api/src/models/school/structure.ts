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
import { LevelType, LevelSettings, SchoolRole, LEVEL_TYPES, SCHOOL_ROLES } from '../../school/constants';

export class School extends Model<InferAttributes<School>, InferCreationAttributes<School>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare slug: string;
  declare cue: string | null;
  declare address: string | null;
  declare phone: string | null;
  declare email: string | null;
  declare logoUrl: string | null;
  /** Cuota de almacenamiento en MB (null = la global STORAGE_QUOTA_MB). */
  declare storageQuotaMb: CreationOptional<number | null>;
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

School.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    cue: { type: DataTypes.STRING(20), allowNull: true },
    address: { type: DataTypes.STRING(200), allowNull: true },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    email: { type: DataTypes.STRING(120), allowNull: true },
    logoUrl: { type: DataTypes.STRING(500), allowNull: true },
    storageQuotaMb: { type: DataTypes.INTEGER, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'School', tableName: 'School' }
);

export class Level extends Model<InferAttributes<Level>, InferCreationAttributes<Level>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<School['id']>;
  declare type: LevelType;
  declare name: string;
  declare settings: LevelSettings;
}

Level.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.ENUM(...LEVEL_TYPES), allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false },
    settings: { type: DataTypes.JSONB, allowNull: false },
  },
  {
    sequelize,
    modelName: 'Level',
    tableName: 'Level',
    timestamps: false,
    indexes: [{ unique: true, fields: ['schoolId', 'type'] }],
  }
);

export class AcademicYear extends Model<InferAttributes<AcademicYear>, InferCreationAttributes<AcademicYear>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<School['id']>;
  declare year: number;
  declare startDate: string;
  declare endDate: string;
  declare isCurrent: CreationOptional<boolean>;
}

AcademicYear.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    year: { type: DataTypes.INTEGER, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'AcademicYear',
    tableName: 'AcademicYear',
    timestamps: false,
    indexes: [{ unique: true, fields: ['schoolId', 'year'] }],
  }
);

export class Division extends Model<InferAttributes<Division>, InferCreationAttributes<Division>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<School['id']>;
  declare levelId: ForeignKey<Level['id']>;
  declare academicYearId: ForeignKey<AcademicYear['id']>;
  /** Ej: "3º B", "Sala de 5 Azul". */
  declare name: string;
  declare gradeYear: number;
  declare section: string | null;
  declare shift: string | null;
  declare Level?: NonAttribute<Level>;
}

Division.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
    gradeYear: { type: DataTypes.INTEGER, allowNull: false },
    section: { type: DataTypes.STRING(20), allowNull: true },
    shift: { type: DataTypes.STRING(30), allowNull: true },
  },
  {
    sequelize,
    modelName: 'Division',
    tableName: 'Division',
    timestamps: false,
    indexes: [{ fields: ['schoolId', 'academicYearId'] }, { unique: true, fields: ['academicYearId', 'levelId', 'name'] }],
  }
);

export class Subject extends Model<InferAttributes<Subject>, InferCreationAttributes<Subject>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<School['id']>;
  declare levelId: ForeignKey<Level['id']>;
  declare name: string;
  declare code: string | null;
  /** Año al que corresponde (null = todos los años del nivel). */
  declare gradeYear: number | null;
  declare active: CreationOptional<boolean>;
}

Subject.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(20), allowNull: true },
    gradeYear: { type: DataTypes.INTEGER, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, modelName: 'Subject', tableName: 'Subject', timestamps: false, indexes: [{ fields: ['schoolId', 'levelId'] }] }
);

/** Qué docente dicta qué materia en qué división. Base del alcance docente. */
export class TeachingAssignment extends Model<
  InferAttributes<TeachingAssignment>,
  InferCreationAttributes<TeachingAssignment>
> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<School['id']>;
  declare divisionId: ForeignKey<Division['id']>;
  declare subjectId: ForeignKey<Subject['id']>;
  declare teacherId: ForeignKey<number>;
  declare Division?: NonAttribute<Division>;
  declare Subject?: NonAttribute<Subject>;
}

TeachingAssignment.init(
  { id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true } },
  {
    sequelize,
    modelName: 'TeachingAssignment',
    tableName: 'TeachingAssignment',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['divisionId', 'subjectId', 'teacherId'] },
      { fields: ['teacherId'] },
    ],
  }
);

/** Rol de un usuario dentro de una institución. Un usuario puede tener varios (ej: docente + preceptor). */
export class Membership extends Model<InferAttributes<Membership>, InferCreationAttributes<Membership>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<number>;
  declare schoolId: ForeignKey<School['id']>;
  declare role: SchoolRole;
  /** Limita el alcance a un nivel (ej: Rectora → Secundario). null = toda la institución. */
  declare levelId: ForeignKey<number | null>;
  /** Para preceptores: divisiones a cargo. Vacío = todo su nivel. */
  declare divisionIds: CreationOptional<number[]>;
  declare title: string | null;
  declare active: CreationOptional<boolean>;
  declare School?: NonAttribute<School>;
  declare Level?: NonAttribute<Level>;
}

Membership.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    role: { type: DataTypes.ENUM(...SCHOOL_ROLES), allowNull: false },
    divisionIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    title: { type: DataTypes.STRING(80), allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'Membership',
    tableName: 'Membership',
    timestamps: true,
    indexes: [{ fields: ['userId', 'schoolId'] }, { fields: ['schoolId', 'role'] }],
  }
);
