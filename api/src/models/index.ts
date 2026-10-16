/**
 * Punto único de carga de modelos y asociaciones. Importar desde acá garantiza que las
 * asociaciones estén definidas antes de cualquier consulta.
 */
import { sequelize } from '../config/database';

import User from './User';
import Role from './Role';
import Permission from './Permission';
import RolePermission from './RolePermission';
import Chat from './Chat';
import ChatUser from './ChatUser';
import ChatMessage from './ChatMessage';
import Course from './Course';
import Module from './Module';
import Lesson from './Lesson';
import UserCourse from './UserCourse';
import LessonComment from './LessonComment';
import Notification from './Notification';
import UserNotification from './UserNotification';
import Friendship from './Friendship';
import UserLessonProgress from './UserLessonProgress';
import PasswordResetToken from './PasswordResetToken';

import { School, Level, AcademicYear, Division, Subject, TeachingAssignment, Membership } from './school/structure';
import { Student, Enrollment, StudentGuardian } from './school/people';
import { GradingPeriod, Grade, ReportCardPublication } from './school/academics';
import { Attendance, AttendanceRule, Alert } from './school/attendance';
import { Announcement, AnnouncementRecipient, Thread, ThreadParticipant, ThreadMessage } from './school/communication';
import { AuditLog, DeviceToken } from './school/system';
import { FileAsset, ClassroomPost } from './school/classroom';

let associated = false;

export const associateModels = () => {
  if (associated) return;
  associated = true;

  // --- Legacy (LMS, chat social, notificaciones) ---
  User.associate();
  Role.associate();
  Permission.associate();
  Chat.associate();
  ChatUser.associate();
  ChatMessage.associate();
  Course.associate();
  Module.associate();
  Lesson.associate();
  UserCourse.associate();
  LessonComment.associate();
  Notification.associate();
  UserNotification.associate();
  Friendship.associate();
  UserLessonProgress.associate();
  PasswordResetToken.associate();

  const req = (name: string) => ({ foreignKey: { name, allowNull: false }, onDelete: 'CASCADE' as const });
  const opt = (name: string) => ({ foreignKey: { name, allowNull: true }, onDelete: 'SET NULL' as const });

  // --- Estructura ---
  for (const M of [Level, AcademicYear, Division, Subject, TeachingAssignment, Membership, Student, GradingPeriod, Grade,
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

  Membership.belongsTo(User, req('userId'));
  Membership.belongsTo(Level, opt('levelId'));
  User.hasMany(Membership, req('userId'));

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

  // --- Aulas y archivos ---
  FileAsset.belongsTo(User, { ...req('uploaderId'), as: 'Uploader' });
  FileAsset.belongsTo(Division, opt('divisionId'));
  FileAsset.belongsTo(Subject, opt('subjectId'));
  ClassroomPost.belongsTo(Division, req('divisionId'));
  ClassroomPost.belongsTo(Subject, opt('subjectId'));
  ClassroomPost.belongsTo(User, { ...req('authorId'), as: 'Author' });
  Division.hasMany(ClassroomPost, req('divisionId'));
};

associateModels();

export {
  sequelize,
  User, Role, Permission, RolePermission, Chat, ChatUser, ChatMessage, Course, Module, Lesson, UserCourse,
  LessonComment, Notification, UserNotification, Friendship, UserLessonProgress, PasswordResetToken,
  School, Level, AcademicYear, Division, Subject, TeachingAssignment, Membership,
  Student, Enrollment, StudentGuardian, GradingPeriod, Grade, ReportCardPublication,
  Attendance, AttendanceRule, Alert, Announcement, AnnouncementRecipient, Thread, ThreadParticipant, ThreadMessage,
  AuditLog, DeviceToken, FileAsset, ClassroomPost,
};
