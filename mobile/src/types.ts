/** Tipos de las respuestas de la API que usa la app (espejo de client/src/school/types.ts). */

export type SchoolRole = 'REPRESENTANTE_LEGAL' | 'DIRECTOR' | 'VICEDIRECTOR' | 'RECTOR' | 'SECRETARIO' | 'COORDINADOR' | 'PRECEPTOR' | 'JEFE_PRECEPTORES' | 'ADMINISTRACION' | 'DOCENTE' | 'TUTOR' | 'ESTUDIANTE';
export type LevelType = 'INICIAL' | 'PRIMARIO' | 'SECUNDARIO';
export type AttendanceStatus = 'PRESENTE' | 'AUSENTE' | 'TARDE' | 'RETIRO';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['PRESENTE', 'AUSENTE', 'TARDE', 'RETIRO'];
export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = { PRESENTE: 'Presente', AUSENTE: 'Ausente', TARDE: 'Tarde', RETIRO: 'Retiro' };

/** Permisos "entidad:acción" (los manda la API en session.permissions). */
export type PermissionKey = string;
export const Perm = {
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_UPDATE: 'attendance:update',
  ANNOUNCEMENTS_CREATE: 'announcements:create',
  MESSAGES_MANAGE: 'messages:manage',
  USERS_READ: 'users:read',
  GRADES_READ: 'grades:read',
  ALERTS_READ: 'alerts:read',
} as const;

export interface UserData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  dni: string | null;
  avatar: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  isSuperAdmin: boolean;
}
export interface StoredSession { token: string; userData: UserData }

export interface SchoolSummary { id: number; name: string; slug: string; logoUrl: string | null }

export interface SchoolSession {
  school: SchoolSummary;
  levels: Array<{ id: number; name: string; type: LevelType }>;
  activeLevelId: number | null;
  academicYearId: number | null;
  roles: SchoolRole[];
  roleLabels: string[];
  permissions: PermissionKey[];
  isStaff: boolean;
  isGuardian: boolean;
  scope: { all: boolean; levelIds: number[]; divisionIds: number[] };
  teaching: Array<{ divisionId: number; subjectId: number }>;
  childIds: number[];
  category: 'DIRECTIVO' | 'DOCENTE' | 'FAMILIA' | 'ESTUDIANTE' | null;
  categoryLabel: string | null;
  self: { studentId: number; divisionId: number | null } | null;
  hasChannels: boolean;
  features?: { fileUploads: boolean };
  plan: { code: string; name: string; storageGb: number; features: string[] };
}

export interface PersonLite { id: number; firstName: string; lastName: string; avatar?: string | null; photoUrl?: string | null }

export interface Dashboard {
  unreadAnnouncements: number;
  pendingAck: number;
  unreadThreads: number;
  children?: ChildSummary[];
  me?: ChildSummary | null;
  mySubjects?: number;
  alerts?: Partial<Record<'CRITICAL' | 'WARNING' | 'INFO', number>>;
  attendanceToday?: { divisions: number; taken: number; absent: number };
}
export interface ChildSummary {
  id: number;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  division?: { id: number; name: string; Level?: { name: string; type: LevelType } };
  attendance: { days: number; absences: number; percent: number; absentToday: boolean };
  lastReportCardAt: string | null;
}

/** Tipos de comunicado (espejo de ANNOUNCEMENT_CATEGORIES de la API). */
export type AnnouncementCategory = 'INSTITUCIONAL' | 'ACADEMICO' | 'AULICO' | 'ASISTENCIA' | 'CONVIVENCIA' | 'ADMINISTRATIVO' | 'EVENTO' | 'CONSULTA';
export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  INSTITUCIONAL: 'Institucional', ACADEMICO: 'Académico', AULICO: 'Áulico', ASISTENCIA: 'Asistencia', CONVIVENCIA: 'Convivencia', ADMINISTRATIVO: 'Administrativo', EVENTO: 'Eventos y actos', CONSULTA: 'Consulta',
};
/** Etiqueta tolerante: la caché persistida puede traer comunicados sin categoría o una categoría nueva que la app no conoce. */
export const announcementCategoryLabel = (c?: string | null) => (c ? ANNOUNCEMENT_CATEGORY_LABELS[c as AnnouncementCategory] ?? null : null);

export interface Paginated<T> { data: T[]; pagination: { totalItems: number; currentPage: number; totalPages: number } }
export interface AttachmentRef { name: string; url: string; size?: number; type?: string }

export interface InboxItem {
  id: number;
  title: string;
  preview: string;
  priority: 'NORMAL' | 'URGENT';
  requiresAck: boolean;
  audienceLabel: string;
  hasAttachments: boolean;
  createdAt: string;
  author: PersonLite;
  readAt: string | null;
  ackAt: string | null;
  children: string[];
  status?: 'SENT' | 'ARCHIVED';
  // Opcionales: la caché persistida (hasta 7 días) puede traer la forma anterior.
  category?: AnnouncementCategory;
  allowReplies?: boolean;
  myThreadId?: number | null;
}
export interface AnnouncementDetail {
  id: number;
  title: string;
  body: string;
  audienceLabel: string;
  requiresAck: boolean;
  priority: 'NORMAL' | 'URGENT';
  createdAt: string;
  Author: PersonLite;
  attachments: AttachmentRef[];
  myReceipt: { readAt: string | null; ackAt: string | null } | null;
  stats: { total: number; read: number; ack: number } | null;
  category?: AnnouncementCategory;
  allowReplies?: boolean;
  canReply?: boolean;
  myThreadId?: number | null;
  /** Solo para quien lo mandó: cada respuesta es una conversación privada con esa persona. */
  replies?: { total: number; unread: number; items: AnnouncementReply[] } | null;
}
export interface AnnouncementReply {
  threadId: number;
  user: { id: number; firstName: string; lastName: string; avatar: string | null };
  roleLabel: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unread: number;
}

export interface ThreadRow {
  id: number;
  subject: string;
  studentId: number | null;
  studentFirstName: string | null;
  studentLastName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  closedAt: string | null;
  unread: number;
  others: Array<{ userId: number; name: string; avatar: string | null; roleLabel: string }> | null;
  announcementId?: number | null;
}
export interface Message { id: number; threadId?: number; senderId: number; body: string; attachments: AttachmentRef[]; createdAt: string }
export interface ThreadData {
  thread: { id: number; subject: string; closedAt: string | null; student: { id: number; firstName: string; lastName: string } | null; announcement?: { id: number; title: string; category: AnnouncementCategory } | null };
  participants: Array<{ id: number; firstName: string; lastName: string; avatar: string | null; roleLabel: string; lastReadAt: string | null }>;
  messages: Message[];
  hasMore: boolean;
}
export interface Contact { userId: number; name: string; role: string; detail: string | null; avatar: string | null }

export interface TodayRow { division: { id: number; name: string; levelId: number }; taken: boolean; recorded: number; absent: number }
export interface DivisionDay {
  division: { id: number; name: string };
  date: string;
  taken: boolean;
  students: Array<{ student: PersonLite; status: AttendanceStatus; justified: boolean; note: string | null; recordId: number | null }>;
}
export interface StudentAttendance {
  summary: { days: number; total: number; unjustified: number; percent: number; byStatus: Record<AttendanceStatus, number> };
  records: Array<{ id: number; date: string; status: AttendanceStatus; value: number; justified: boolean; note: string | null }>;
}

export interface Period { id: number; name: string; groupName: string | null; kind: string; order?: number; closed?: boolean; published?: boolean }
export interface GradeValue { numericValue: number | null; conceptualValue: string | null; narrative: string | null; observation: string | null; atRisk?: boolean }
export interface ReportCard {
  student: { id: number; firstName: string; lastName: string; dni: string | null };
  division: { id: number; name: string };
  level: { id: number; name: string; type: LevelType; settings: { passingGrade: number } };
  periods: Period[];
  rows: Array<{ subjectId: number; subject: string; grades: Record<number, GradeValue>; final: number | null; finalApproved: boolean | null }>;
}

/** Un ciclo lectivo de la trayectoria del alumno. */
export interface EnrollmentHistory { academicYearId: number; year: number; status: string; division: { id: number; name: string; level: string | null } | null }

export interface Child { id: number; firstName: string; lastName: string; photoUrl: string | null; Enrollments?: Array<{ Division?: { id: number; name: string; Level?: { name: string; type: LevelType } } }> }

export interface NotificationRow {
  notificationId: number;
  read: boolean;
  Notification: { id: number; title: string; message: string; type?: string; link?: string | null; createdAt: string };
}
