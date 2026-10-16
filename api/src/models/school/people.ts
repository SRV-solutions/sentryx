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
import type { Division } from './structure';

export class Student extends Model<InferAttributes<Student>, InferCreationAttributes<Student>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare firstName: string;
  declare lastName: string;
  declare dni: string | null;
  declare birthDate: string | null;
  declare photoUrl: string | null;
  /** Información sensible (salud, autorizaciones). Solo visible para personal con people.read. */
  declare notes: string | null;
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Enrollments?: NonAttribute<Enrollment[]>;
  declare Guardians?: NonAttribute<StudentGuardian[]>;
}

Student.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    firstName: { type: DataTypes.STRING(80), allowNull: false },
    lastName: { type: DataTypes.STRING(80), allowNull: false },
    dni: { type: DataTypes.STRING(15), allowNull: true },
    birthDate: { type: DataTypes.DATEONLY, allowNull: true },
    photoUrl: { type: DataTypes.STRING(500), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Student',
    tableName: 'Student',
    indexes: [{ unique: true, fields: ['schoolId', 'dni'] }, { fields: ['schoolId', 'lastName'] }],
  }
);

export class Enrollment extends Model<InferAttributes<Enrollment>, InferCreationAttributes<Enrollment>> {
  declare id: CreationOptional<number>;
  declare studentId: ForeignKey<Student['id']>;
  declare divisionId: ForeignKey<number>;
  declare academicYearId: ForeignKey<number>;
  declare status: CreationOptional<'ACTIVE' | 'WITHDRAWN'>;
  declare Division?: NonAttribute<Division>;
  declare Student?: NonAttribute<Student>;
}

Enrollment.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    status: { type: DataTypes.ENUM('ACTIVE', 'WITHDRAWN'), allowNull: false, defaultValue: 'ACTIVE' },
  },
  {
    sequelize,
    modelName: 'Enrollment',
    tableName: 'Enrollment',
    timestamps: true,
    indexes: [{ unique: true, fields: ['studentId', 'academicYearId'] }, { fields: ['divisionId'] }],
  }
);

/** Vínculo familia ↔ alumno. Define qué ve cada padre/madre/tutor. */
export class StudentGuardian extends Model<InferAttributes<StudentGuardian>, InferCreationAttributes<StudentGuardian>> {
  declare id: CreationOptional<number>;
  declare studentId: ForeignKey<Student['id']>;
  declare userId: ForeignKey<number>;
  declare relationship: string;
  declare isPrimary: CreationOptional<boolean>;
  declare canPickUp: CreationOptional<boolean>;
  declare receivesCommunications: CreationOptional<boolean>;
  declare Student?: NonAttribute<Student>;
}

StudentGuardian.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    relationship: { type: DataTypes.STRING(40), allowNull: false },
    isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    canPickUp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    receivesCommunications: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'StudentGuardian',
    tableName: 'StudentGuardian',
    timestamps: true,
    indexes: [{ unique: true, fields: ['studentId', 'userId'] }, { fields: ['userId'] }],
  }
);
