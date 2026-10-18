/**
 * Permisos = ACCIÓN sobre una ENTIDAD. Espejo de api/src/constants/permissions.ts.
 * Uso: const { can } = useSchool(); can(Entity.USERS, Action.UPDATE)
 * La app solo oculta lo que no corresponde; quien decide de verdad es la API.
 */
export enum Entity {
  SCHOOL = 'school',
  USERS = 'users',
  CONTACT_INFO = 'contact_info',
  ANNOUNCEMENTS = 'announcements',
  MESSAGES = 'messages',
  CHANNELS = 'channels',
  CLASSROOM_POSTS = 'classroom_posts',
  GRADES = 'grades',
  GRADING_PERIODS = 'grading_periods',
  REPORT_CARDS = 'report_cards',
  ATTENDANCE = 'attendance',
  ALERTS = 'alerts',
  ALERT_RULES = 'alert_rules',
  BILLING = 'billing',
  AUDIT_LOG = 'audit_log',
}

export enum Action {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  UPDATE_ANY = 'update_any',
  CREATE_SCHOOL_WIDE = 'create_school_wide',
  READ_STATS = 'read_stats',
  MANAGE = 'manage',
  MODERATE = 'moderate',
  CLOSE = 'close',
  PUBLISH = 'publish',
}

/** "entidad:acción", como la manda la API en session.permissions. */
export type PermissionKey = `${Entity}:${Action}`;
export type PermissionPair = [Entity, Action];
export const permissionKey = (entity: Entity, action: Action): PermissionKey => `${entity}:${action}`;
