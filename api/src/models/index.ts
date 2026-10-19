/**
 * Punto único de carga de modelos y asociaciones. Importar desde acá garantiza que las
 * asociaciones estén definidas antes de cualquier consulta.
 */
import { sequelize } from '../config/database';

import User from './User';
import Role from './Role';
import Permission from './Permission';
import RolePermission from './RolePermission';
import UserRole from './UserRole';
import Notification from './Notification';
import UserNotification from './UserNotification';
import PasswordResetToken from './PasswordResetToken';

import { School, Level, AcademicYear, Division, Subject, TeachingAssignment } from './school/structure';
import { Student, Enrollment, StudentGuardian } from './school/people';
import { GradingPeriod, Grade, ReportCardPublication } from './school/academics';
import { Attendance, AttendanceRule, Alert } from './school/attendance';
import { Announcement, AnnouncementRecipient, Thread, ThreadParticipant, ThreadMessage } from './school/communication';
import { AuditLog, ActivityLog, SupportReport, DeviceToken, UserAvatar } from './school/system';
import { FileAsset, ClassroomPost } from './school/classroom';
import { AccessPeriod, BillingStatement } from './school/billing';
import { Channel, ChannelMessage, ChannelRead, ChannelMute } from './school/channels';
import { PlanAssignment, PlanRequest } from './school/plans';
import { StaffPosition, PayrollReceipt } from './school/staff';
import { SchoolEvent, EventManager, EventPost } from './school/events';
import { SubjectProgram, ProgramUnit, Quiz, QuizAssignment, QuizAttempt, LiveGame, LivePlayer, LiveAnswer } from './school/teaching';

let associated = false;

export const associateModels = () => {
  if (associated) return;
  associated = true;

  // --- Roles y permisos: un usuario tiene muchos roles; un rol tiene muchos permisos ---
  Role.belongsToMany(Permission, { through: RolePermission, foreignKey: 'roleId', otherKey: 'permissionId' });
  Permission.belongsToMany(Role, { through: RolePermission, foreignKey: 'permissionId', otherKey: 'roleId' });

  // --- Cuentas y notificaciones ---
  User.associate();
  Notification.associate();
  UserNotification.associate();
  PasswordResetToken.associate();

  const req = (name: string) => ({ foreignKey: { name, allowNull: false }, onDelete: 'CASCADE' as const });
  const opt = (name: string) => ({ foreignKey: { name, allowNull: true }, onDelete: 'SET NULL' as const });

  // --- Estructura ---
  for (const M of [Level, AcademicYear, Division, Subject, TeachingAssignment, Student, GradingPeriod, Grade,
    ReportCardPublication, Attendance, AttendanceRule, Alert, Announcement, Thread, FileAsset, ClassroomPost]) {
    (M as any).belongsTo(School, req('schoolId'));
  }
  School.hasMany(Level, req('schoolId'));

  Division.belongsTo(Level, req('levelId'));
  Division.belongsTo(AcademicYear, req('academicYearId'));
  Level.hasMany(Division, req('levelId'));
  Subject.belongsTo(Level, req('levelId'));

  TeachingAssignment.belongsTo(Division, req('divisionId'));
  TeachingAssignment.belongsTo(Subject, req('subjectId'));
  TeachingAssignment.belongsTo(User, { ...req('teacherId'), as: 'Teacher' });
  Division.hasMany(TeachingAssignment, req('divisionId'));

  UserRole.belongsTo(User, req('userId'));
  UserRole.belongsTo(School, opt('schoolId'));
  UserRole.belongsTo(Level, opt('levelId'));
  User.hasMany(UserRole, req('userId'));

  // --- Personas ---
  Enrollment.belongsTo(Student, req('studentId'));
  Enrollment.belongsTo(Division, req('divisionId'));
  Enrollment.belongsTo(AcademicYear, req('academicYearId'));
  Student.hasMany(Enrollment, req('studentId'));
  Division.hasMany(Enrollment, req('divisionId'));

  StudentGuardian.belongsTo(Student, req('studentId'));
  StudentGuardian.belongsTo(User, req('userId'));
  Student.hasMany(StudentGuardian, { ...req('studentId'), as: 'Guardians' });
  User.hasMany(StudentGuardian, { ...req('userId'), as: 'Children' });

  // --- Académico ---
  GradingPeriod.belongsTo(Level, req('levelId'));
  GradingPeriod.belongsTo(AcademicYear, req('academicYearId'));
  Grade.belongsTo(Student, req('studentId'));
  Grade.belongsTo(Subject, req('subjectId'));
  Grade.belongsTo(Division, req('divisionId'));
  Grade.belongsTo(GradingPeriod, req('periodId'));
  Grade.belongsTo(User, { foreignKey: { name: 'updatedById', allowNull: false }, as: 'UpdatedBy' });
  ReportCardPublication.belongsTo(Division, req('divisionId'));
  ReportCardPublication.belongsTo(GradingPeriod, req('periodId'));
  ReportCardPublication.belongsTo(User, { foreignKey: { name: 'publishedById', allowNull: false }, as: 'PublishedBy' });

  // --- Asistencia y alertas ---
  Attendance.belongsTo(Student, req('studentId'));
  Attendance.belongsTo(Division, req('divisionId'));
  Attendance.belongsTo(User, { foreignKey: { name: 'recordedById', allowNull: false }, as: 'RecordedBy' });
  AttendanceRule.belongsTo(Level, opt('levelId'));
  Alert.belongsTo(Student, req('studentId'));
  Alert.belongsTo(AttendanceRule, req('ruleId'));
  Alert.belongsTo(User, { ...opt('handledById'), as: 'HandledBy' });

  // --- Comunicación ---
  Announcement.belongsTo(User, { ...req('authorId'), as: 'Author' });
  Announcement.hasMany(AnnouncementRecipient, req('announcementId'));
  AnnouncementRecipient.belongsTo(Announcement, req('announcementId'));
  AnnouncementRecipient.belongsTo(User, req('userId'));

  Thread.belongsTo(Student, opt('studentId'));
  Thread.belongsTo(User, { ...req('createdById'), as: 'CreatedBy' });
  Thread.hasMany(ThreadParticipant, { ...req('threadId'), as: 'Participants' });
  Thread.hasMany(ThreadMessage, req('threadId'));
  ThreadParticipant.belongsTo(Thread, req('threadId'));
  ThreadParticipant.belongsTo(User, req('userId'));
  ThreadMessage.belongsTo(Thread, req('threadId'));
  ThreadMessage.belongsTo(User, { ...req('senderId'), as: 'Sender' });

  DeviceToken.belongsTo(User, req('userId'));
  SupportReport.belongsTo(User, { foreignKey: 'userId', as: 'Reporter' });
  AuditLog.belongsTo(User, { foreignKey: 'userId', constraints: false });
  ActivityLog.belongsTo(User, { foreignKey: 'userId', constraints: false });

  // --- Aulas y archivos ---
  FileAsset.belongsTo(User, { ...req('uploaderId'), as: 'Uploader' });
  FileAsset.belongsTo(Division, opt('divisionId'));
  FileAsset.belongsTo(Subject, opt('subjectId'));
  ClassroomPost.belongsTo(Division, req('divisionId'));
  ClassroomPost.belongsTo(Subject, opt('subjectId'));
  ClassroomPost.belongsTo(User, { ...req('authorId'), as: 'Author' });
  Division.hasMany(ClassroomPost, req('divisionId'));

  // --- Canales de curso ---
  Channel.belongsTo(Division, { foreignKey: 'divisionId' });
  Channel.belongsTo(Subject, { foreignKey: 'subjectId' });
  ChannelMessage.belongsTo(User, { foreignKey: 'senderId', as: 'Sender' });

  // --- Facturación y planes ---
  AccessPeriod.belongsTo(User, { foreignKey: 'userId', constraints: false });
  PlanAssignment.belongsTo(User, { foreignKey: 'userId' });
  PlanRequest.belongsTo(User, { foreignKey: 'userId' });

  // --- Personal: legajo y recibos ---
  StaffPosition.belongsTo(User, { foreignKey: 'userId' });
  StaffPosition.belongsTo(Level, { foreignKey: 'levelId', constraints: false });
  PayrollReceipt.belongsTo(User, { foreignKey: 'userId' });
  PayrollReceipt.belongsTo(FileAsset, { foreignKey: 'fileId', constraints: false });

  // --- Calendario ---
  SchoolEvent.hasMany(EventManager, { foreignKey: 'eventId', as: 'Managers' });
  EventManager.belongsTo(SchoolEvent, { foreignKey: 'eventId' });
  EventManager.belongsTo(User, { foreignKey: 'userId' });
  SchoolEvent.hasMany(EventPost, { foreignKey: 'eventId' });
  EventPost.belongsTo(User, { foreignKey: 'authorId', as: 'Author' });

  // --- Programas y juegos ---
  SubjectProgram.hasMany(ProgramUnit, { foreignKey: 'programId', as: 'Units' });
  SubjectProgram.belongsTo(Subject, { foreignKey: 'subjectId' });
  SubjectProgram.belongsTo(Division, { foreignKey: 'divisionId' });
  SubjectProgram.belongsTo(User, { foreignKey: 'authorId', as: 'Author' });
  ProgramUnit.belongsTo(SubjectProgram, { foreignKey: 'programId' });
  Quiz.belongsTo(Subject, { foreignKey: 'subjectId' });
  Quiz.belongsTo(ProgramUnit, { foreignKey: 'programUnitId' });
  Quiz.belongsTo(User, { foreignKey: 'authorId', as: 'Author' });
  Quiz.hasMany(QuizAssignment, { foreignKey: 'quizId' });
  QuizAssignment.belongsTo(Quiz, { foreignKey: 'quizId' });
  QuizAssignment.belongsTo(Division, { foreignKey: 'divisionId' });
  QuizAssignment.hasMany(QuizAttempt, { foreignKey: 'assignmentId' });
  QuizAttempt.belongsTo(QuizAssignment, { foreignKey: 'assignmentId' });
  QuizAttempt.belongsTo(Student, { foreignKey: 'studentId' });
  LiveGame.hasMany(LivePlayer, { foreignKey: 'gameId' });
  LivePlayer.belongsTo(LiveGame, { foreignKey: 'gameId' });
};

associateModels();

export {
  sequelize,
  User, Role, Permission, RolePermission, UserRole, Notification, UserNotification, PasswordResetToken,
  School, Level, AcademicYear, Division, Subject, TeachingAssignment,
  Student, Enrollment, StudentGuardian, GradingPeriod, Grade, ReportCardPublication,
  Attendance, AttendanceRule, Alert, Announcement, AnnouncementRecipient, Thread, ThreadParticipant, ThreadMessage,
  AuditLog, ActivityLog, SupportReport, DeviceToken, UserAvatar, FileAsset, ClassroomPost, AccessPeriod, BillingStatement,
  Channel, ChannelMessage, ChannelRead, ChannelMute,
  PlanAssignment, PlanRequest, StaffPosition, PayrollReceipt, SchoolEvent, EventManager, EventPost,
  SubjectProgram, ProgramUnit, Quiz, QuizAssignment, QuizAttempt, LiveGame, LivePlayer, LiveAnswer,
};
