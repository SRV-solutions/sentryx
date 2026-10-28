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

/** Motivos de baja de un alumno. */
export const LEAVE_REASONS = {
  CAMBIO_DE_COLEGIO: 'Cambio de colegio',
  EGRESO: 'Egresó',
  MUDANZA: 'Mudanza',
  ABANDONO: 'Abandono',
  OTRO: 'Otro motivo',
} as const;
export type LeaveReason = keyof typeof LEAVE_REASONS;

export class Student extends Model<InferAttributes<Student>, InferCreationAttributes<Student>> {
  declare id: CreationOptional<number>;
  declare schoolId: ForeignKey<number>;
  declare firstName: string;
  declare lastName: string;
  declare dni: string | null;
  declare birthDate: string | null;
  declare photoUrl: string | null;
  /** Información sensible (salud, autorizaciones). Solo la ve el personal con alcance sobre el alumno (nunca la familia). */
  declare notes: string | null;
  /** Cuenta propia del alumno (solo Secundario). null = sin cuenta. */
  declare userId: CreationOptional<number | null>;
  declare active: CreationOptional<boolean>;
  /** Baja: fecha, motivo (ver LEAVE_REASONS) y notas. null mientras está activo. */
  declare leftAt: CreationOptional<string | null>;
  declare leaveReason: CreationOptional<LeaveReason | null>;
  declare leaveNotes: CreationOptional<string | null>;
  /** Último aviso a la familia de que su cuenta no tiene email (Alertas → Sin email). */
  declare noEmailNoticeAt: CreationOptional<Date | null>;
  /** La conducción le pidió al estudiante que cambie su email (ej: uno inventado). Se borra cuando lo cambia. */
  declare emailChangeRequestedAt: CreationOptional<Date | null>;
  declare emailChangeReason: CreationOptional<string | null>;
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
    userId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'User', key: 'id' }, onDelete: 'SET NULL' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    leftAt: { type: DataTypes.DATEONLY, allowNull: true },
    leaveReason: { type: DataTypes.STRING(30), allowNull: true },
    leaveNotes: { type: DataTypes.TEXT, allowNull: true },
    noEmailNoticeAt: { type: DataTypes.DATE, allowNull: true },
    emailChangeRequestedAt: { type: DataTypes.DATE, allowNull: true },
    emailChangeReason: { type: DataTypes.STRING(300), allowNull: true },
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
  /** ACTIVE: cursando · WITHDRAWN: dado de baja · COMPLETED: terminó el ciclo (promovido, repitió o egresó). */
  declare status: CreationOptional<'ACTIVE' | 'WITHDRAWN' | 'COMPLETED'>;
  declare Division?: NonAttribute<Division>;
  declare Student?: NonAttribute<Student>;
}

Enrollment.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    status: { type: DataTypes.ENUM('ACTIVE', 'WITHDRAWN', 'COMPLETED'), allowNull: false, defaultValue: 'ACTIVE' },
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
  /** Baja lógica: al desvincular no se borra el registro (historial y facturación auditables). */
  declare active: CreationOptional<boolean>;
  declare endedAt: CreationOptional<Date | null>;
  declare Student?: NonAttribute<Student>;
}

StudentGuardian.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    relationship: { type: DataTypes.STRING(40), allowNull: false },
    isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    canPickUp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    receivesCommunications: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    endedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'StudentGuardian',
    tableName: 'StudentGuardian',
    timestamps: true,
    // Toda consulta (incluidos los include) ve solo vínculos vigentes. El historial: StudentGuardian.unscoped().
    defaultScope: { where: { active: true } },
    indexes: [{ unique: true, fields: ['studentId', 'userId'] }, { fields: ['userId'] }],
  }
);
