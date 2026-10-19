import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../../config/database';
import type User from '../User';
import type { Subject, Division } from './structure';

// ---------------- Programas de las materias ----------------

export const PROGRAM_STATUSES = ['BORRADOR', 'PUBLICADO'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

/** Programa (planificación anual) de una materia en un ciclo lectivo, opcionalmente de un curso. */
export class SubjectProgram extends Model<InferAttributes<SubjectProgram>, InferCreationAttributes<SubjectProgram>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare subjectId: number;
  declare academicYearId: number;
  /** null = vale para todos los cursos donde se dicta la materia. */
  declare divisionId: number | null;
  declare authorId: number;
  declare fundamentals: CreationOptional<string>;
  declare objectives: CreationOptional<string>;
  declare methodology: CreationOptional<string>;
  declare evaluation: CreationOptional<string>;
  declare bibliography: CreationOptional<string>;
  /** Programa original (PDF o Word) si el docente prefiere subirlo. */
  declare fileIds: CreationOptional<number[]>;
  declare status: CreationOptional<ProgramStatus>;
  declare publishedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Units?: NonAttribute<ProgramUnit[]>;
  declare Subject?: NonAttribute<Subject>;
  declare Division?: NonAttribute<Division>;
  declare Author?: NonAttribute<User>;
}

SubjectProgram.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    subjectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Subject', key: 'id' } },
    academicYearId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'AcademicYear', key: 'id' } },
    divisionId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Division', key: 'id' } },
    authorId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    fundamentals: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    objectives: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    methodology: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    evaluation: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    bibliography: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    fileIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'BORRADOR' },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'SubjectProgram', tableName: 'SubjectProgram', indexes: [{ fields: ['schoolId', 'academicYearId', 'subjectId'] }] }
);

/** Unidad del programa: contenidos y aprendizajes esperados. Los juegos se enlazan a una unidad. */
export class ProgramUnit extends Model<InferAttributes<ProgramUnit>, InferCreationAttributes<ProgramUnit>> {
  declare id: CreationOptional<number>;
  declare programId: number;
  declare order: number;
  declare title: string;
  declare contents: CreationOptional<string>;
  declare learningGoals: CreationOptional<string>;
  declare startDate: string | null;
  declare endDate: string | null;
}

ProgramUnit.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    programId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'SubjectProgram', key: 'id' }, onDelete: 'CASCADE' },
    order: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    contents: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    learningGoals: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
  },
  { sequelize, modelName: 'ProgramUnit', tableName: 'ProgramUnit', timestamps: false, indexes: [{ fields: ['programId', 'order'] }] }
);

// ---------------- Juegos de preguntas ----------------

export interface QuizOption {
  text: string;
  correct: boolean;
}
export interface QuizQuestion {
  /** Identificador estable dentro del juego (para resultados por pregunta). */
  id: string;
  text: string;
  /** Segundos para responder (en vivo). */
  timeLimit: number;
  /** 0 = sin puntos (pregunta de opinión), 1000 = normal, 2000 = doble. */
  points: number;
  options: QuizOption[];
}

/** Juego de preguntas de un docente ("tipo Kahoot"). */
export class Quiz extends Model<InferAttributes<Quiz>, InferCreationAttributes<Quiz>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare authorId: number;
  declare subjectId: number | null;
  /** Unidad del programa con la que se trabaja (plan de aprendizaje). */
  declare programUnitId: number | null;
  declare title: string;
  declare description: CreationOptional<string>;
  declare questions: CreationOptional<QuizQuestion[]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Subject?: NonAttribute<Subject>;
  declare ProgramUnit?: NonAttribute<ProgramUnit>;
  declare Author?: NonAttribute<User>;
}

Quiz.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    authorId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'User', key: 'id' } },
    subjectId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Subject', key: 'id' } },
    programUnitId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'ProgramUnit', key: 'id' }, onDelete: 'SET NULL' },
    title: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    questions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'Quiz', tableName: 'Quiz', indexes: [{ fields: ['schoolId', 'authorId'] }] }
);

/** Juego asignado como tarea a un curso, con fecha límite. */
export class QuizAssignment extends Model<InferAttributes<QuizAssignment>, InferCreationAttributes<QuizAssignment>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare quizId: number;
  declare divisionId: number;
  declare createdById: number;
  declare closesAt: Date;
  /** Al terminar, el estudiante ve cuáles eran las respuestas correctas. */
  declare showAnswers: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare Quiz?: NonAttribute<Quiz>;
  declare Division?: NonAttribute<Division>;
}

QuizAssignment.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    quizId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Quiz', key: 'id' }, onDelete: 'CASCADE' },
    divisionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Division', key: 'id' } },
    createdById: { type: DataTypes.INTEGER, allowNull: false },
    closesAt: { type: DataTypes.DATE, allowNull: false },
    showAnswers: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'QuizAssignment', tableName: 'QuizAssignment', updatedAt: false, indexes: [{ fields: ['divisionId', 'closesAt'] }, { fields: ['quizId'] }] }
);

export interface AttemptAnswer {
  questionId: string;
  option: number | null;
  correct: boolean;
  points: number;
}

/** Resolución de una tarea por un estudiante (una sola vez). */
export class QuizAttempt extends Model<InferAttributes<QuizAttempt>, InferCreationAttributes<QuizAttempt>> {
  declare id: CreationOptional<number>;
  declare assignmentId: number;
  declare studentId: number;
  declare userId: number;
  declare answers: AttemptAnswer[];
  declare score: number;
  declare correctCount: number;
  declare questionCount: number;
  declare finishedAt: Date;
  declare QuizAssignment?: NonAttribute<QuizAssignment>;
}

QuizAttempt.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    assignmentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'QuizAssignment', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Student', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    answers: { type: DataTypes.JSONB, allowNull: false },
    score: { type: DataTypes.INTEGER, allowNull: false },
    correctCount: { type: DataTypes.INTEGER, allowNull: false },
    questionCount: { type: DataTypes.INTEGER, allowNull: false },
    finishedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, modelName: 'QuizAttempt', tableName: 'QuizAttempt', timestamps: false, indexes: [{ unique: true, fields: ['assignmentId', 'studentId'] }, { fields: ['studentId'] }] }
);

export const LIVE_GAME_STATUSES = ['LOBBY', 'QUESTION', 'REVEAL', 'FINISHED'] as const;
export type LiveGameStatus = (typeof LIVE_GAME_STATUSES)[number];

/** Partida en vivo: el docente la proyecta y los alumnos entran con el PIN desde su celular. */
export class LiveGame extends Model<InferAttributes<LiveGame>, InferCreationAttributes<LiveGame>> {
  declare id: CreationOptional<number>;
  declare schoolId: number;
  declare quizId: number;
  declare hostId: number;
  declare pin: string;
  declare status: CreationOptional<LiveGameStatus>;
  /** -1 en la sala de espera. */
  declare currentIndex: CreationOptional<number>;
  declare questionStartedAt: Date | null;
  /** Copia de las preguntas al crear la partida (editar el juego no la altera). */
  declare questions: QuizQuestion[];
  declare title: string;
  declare createdAt: CreationOptional<Date>;
  declare finishedAt: Date | null;
}

LiveGame.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'School', key: 'id' } },
    quizId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Quiz', key: 'id' }, onDelete: 'CASCADE' },
    hostId: { type: DataTypes.INTEGER, allowNull: false },
    pin: { type: DataTypes.STRING(6), allowNull: false },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'LOBBY' },
    currentIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: -1 },
    questionStartedAt: { type: DataTypes.DATE, allowNull: true },
    questions: { type: DataTypes.JSONB, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    createdAt: DataTypes.DATE,
    finishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: 'LiveGame', tableName: 'LiveGame', updatedAt: false, indexes: [{ fields: ['pin', 'status'] }, { fields: ['quizId'] }] }
);

/** Jugador de una partida en vivo (entra con PIN y apodo; no necesita cuenta). */
export class LivePlayer extends Model<InferAttributes<LivePlayer>, InferCreationAttributes<LivePlayer>> {
  declare id: CreationOptional<number>;
  declare gameId: number;
  declare nickname: string;
  /** SHA-256 del token secreto que identifica al jugador en su celular. */
  declare tokenHash: string;
  declare score: CreationOptional<number>;
  declare kicked: CreationOptional<boolean>;
  declare joinedAt: CreationOptional<Date>;
}

LivePlayer.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    gameId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'LiveGame', key: 'id' }, onDelete: 'CASCADE' },
    nickname: { type: DataTypes.STRING(24), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false },
    score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    kicked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    joinedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'LivePlayer',
    tableName: 'LivePlayer',
    timestamps: false,
    indexes: [{ unique: true, fields: ['gameId', 'nickname'] }, { unique: true, fields: ['tokenHash'] }],
  }
);

/** Respuesta de un jugador a una pregunta en vivo. */
export class LiveAnswer extends Model<InferAttributes<LiveAnswer>, InferCreationAttributes<LiveAnswer>> {
  declare id: CreationOptional<number>;
  declare gameId: number;
  declare playerId: number;
  declare questionIndex: number;
  declare option: number;
  declare correct: boolean;
  declare points: number;
  declare elapsedMs: number;
}

LiveAnswer.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    gameId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'LiveGame', key: 'id' }, onDelete: 'CASCADE' },
    playerId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'LivePlayer', key: 'id' }, onDelete: 'CASCADE' },
    questionIndex: { type: DataTypes.INTEGER, allowNull: false },
    option: { type: DataTypes.INTEGER, allowNull: false },
    correct: { type: DataTypes.BOOLEAN, allowNull: false },
    points: { type: DataTypes.INTEGER, allowNull: false },
    elapsedMs: { type: DataTypes.INTEGER, allowNull: false },
  },
  { sequelize, modelName: 'LiveAnswer', tableName: 'LiveAnswer', timestamps: false, indexes: [{ unique: true, fields: ['gameId', 'playerId', 'questionIndex'] }] }
);
