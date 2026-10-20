/**
 * PERMISOS = ACCIÓN sobre una ENTIDAD.
 *
 * Se usan así en las rutas:
 *   router.patch('/people/:id', authorize(Entity.USERS, Action.UPDATE), PeopleController.update)
 * "Para pasar por acá, como mínimo hay que tener el permiso de editar usuarios".
 *
 * Los permisos se guardan en la tabla Permission (entity + action) y se asignan a los roles en
 * RolePermission. Este archivo define cuáles existen; services/rbac.ts los sincroniza con la base.
 */

/** Sobre qué se actúa. */
export enum Entity {
  // --- Colegio ---
  SCHOOL = 'school', // configuración y estructura: niveles, divisiones, materias, períodos, escudo
  USERS = 'users', // personal, familias, alumnos y sus cuentas
  CONTACT_INFO = 'contact_info', // email, teléfono y DNI de las personas
  ANNOUNCEMENTS = 'announcements',
  MESSAGES = 'messages',
  CHANNELS = 'channels',
  CLASSROOM_POSTS = 'classroom_posts', // materiales y tareas publicados en las aulas
  GRADES = 'grades',
  GRADING_PERIODS = 'grading_periods',
  REPORT_CARDS = 'report_cards',
  ATTENDANCE = 'attendance',
  ALERTS = 'alerts',
  ALERT_RULES = 'alert_rules',
  BILLING = 'billing', // facturación del colegio
  AUDIT_LOG = 'audit_log',
  PLANS = 'plans', // plan de cada persona (define precio, espacio y funciones)
  STAFF_RECORDS = 'staff_records', // legajo del personal: cargos, horas, turnos
  ROLES = 'roles', // roles personalizados del colegio
  PAYROLL = 'payroll', // recibos de sueldo
  EVENTS = 'events', // calendario institucional, actos y sus encargados
  SUBJECT_PROGRAMS = 'subject_programs', // programas de las materias
  QUIZZES = 'quizzes', // juegos de preguntas
  // --- Plataforma (equipo Sentryx) ---
  SCHOOLS = 'schools', // alta, edición y suspensión de colegios
  PLATFORM_BILLING = 'platform_billing',
  NOTIFICATIONS = 'notifications',
  SUPPORT_REPORTS = 'support_reports', // problemas y sugerencias que reportan los usuarios
  PLATFORM_AUDIT = 'platform_audit', // actividad e ingresos de todos los colegios
}

/** Qué se hace. */
export enum Action {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  /** Notas: corregir cualquier nota del alcance, no solo las de sus materias. */
  UPDATE_ANY = 'update_any',
  /** Comunicados: enviar a toda la institución. */
  CREATE_SCHOOL_WIDE = 'create_school_wide',
  /** Comunicados: ver quién leyó los de otros autores. */
  READ_STATS = 'read_stats',
  /** Mensajes: atender conversaciones como personal (recibir, iniciar, derivar, cerrar). */
  MANAGE = 'manage',
  /** Canales: ocultar mensajes y silenciar estudiantes. */
  MODERATE = 'moderate',
  /** Períodos: cerrar y reabrir. */
  CLOSE = 'close',
  /** Boletines: publicarlos a las familias. */
  PUBLISH = 'publish',
  /** Notificaciones: aviso masivo a todos los usuarios. */
  BROADCAST = 'broadcast',
}

export interface PermissionDefinition {
  entity: Entity;
  action: Action;
  /** Agrupa la matriz de "Roles y permisos". */
  group: string;
  description: string;
}

/** Todos los permisos que existen en el sistema. */
export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { entity: Entity.SCHOOL, action: Action.UPDATE, group: 'Institución', description: 'Configurar la institución: niveles, divisiones, materias, períodos y escudo' },
  { entity: Entity.BILLING, action: Action.READ, group: 'Institución', description: 'Ver la facturación del servicio' },
  { entity: Entity.AUDIT_LOG, action: Action.READ, group: 'Institución', description: 'Ver el registro de auditoría' },
  { entity: Entity.PLANS, action: Action.READ, group: 'Institución', description: 'Ver el plan de cada persona' },
  { entity: Entity.PLANS, action: Action.UPDATE, group: 'Institución', description: 'Cambiar el plan de docentes y familias' },
  { entity: Entity.STAFF_RECORDS, action: Action.READ, group: 'Personal', description: 'Ver cargos, horas y turnos del personal' },
  { entity: Entity.STAFF_RECORDS, action: Action.UPDATE, group: 'Personal', description: 'Cargar cargos, horas y turnos del personal' },
  { entity: Entity.ROLES, action: Action.MANAGE, group: 'Personal', description: 'Crear y editar roles personalizados del colegio' },
  { entity: Entity.PAYROLL, action: Action.READ, group: 'Personal', description: 'Ver los recibos de sueldo de todo el personal' },
  { entity: Entity.PAYROLL, action: Action.CREATE, group: 'Personal', description: 'Subir recibos de sueldo' },
  { entity: Entity.PAYROLL, action: Action.DELETE, group: 'Personal', description: 'Anular recibos de sueldo' },
  { entity: Entity.EVENTS, action: Action.READ, group: 'Calendario', description: 'Ver el calendario institucional y participar como encargado de actos' },
  { entity: Entity.EVENTS, action: Action.CREATE, group: 'Calendario', description: 'Crear actos y eventos, e importar feriados' },
  { entity: Entity.EVENTS, action: Action.UPDATE, group: 'Calendario', description: 'Editar eventos y designar encargados' },
  { entity: Entity.EVENTS, action: Action.DELETE, group: 'Calendario', description: 'Eliminar eventos' },
  { entity: Entity.SUBJECT_PROGRAMS, action: Action.CREATE, group: 'Enseñanza', description: 'Cargar el programa de sus materias' },
  { entity: Entity.SUBJECT_PROGRAMS, action: Action.READ, group: 'Enseñanza', description: 'Ver los programas de todas las materias de su alcance' },
  { entity: Entity.SUBJECT_PROGRAMS, action: Action.UPDATE, group: 'Enseñanza', description: 'Editar y aprobar programas de otros docentes' },
  { entity: Entity.QUIZZES, action: Action.CREATE, group: 'Enseñanza', description: 'Crear juegos de preguntas y lanzarlos en vivo o como tarea' },
  { entity: Entity.QUIZZES, action: Action.READ, group: 'Enseñanza', description: 'Ver los juegos y resultados de todos los docentes' },
  { entity: Entity.USERS, action: Action.READ, group: 'Personas', description: 'Ver alumnos, familias y personal de su alcance' },
  { entity: Entity.USERS, action: Action.CREATE, group: 'Personas', description: 'Dar de alta personal, alumnos, familias y cuentas' },
  { entity: Entity.USERS, action: Action.UPDATE, group: 'Personas', description: 'Editar personas, blanquear contraseñas y desactivar accesos' },
  { entity: Entity.CONTACT_INFO, action: Action.READ, group: 'Personas', description: 'Ver email, teléfono y DNI' },
  { entity: Entity.ANNOUNCEMENTS, action: Action.CREATE, group: 'Comunicación', description: 'Enviar comunicados a sus cursos o nivel' },
  { entity: Entity.ANNOUNCEMENTS, action: Action.CREATE_SCHOOL_WIDE, group: 'Comunicación', description: 'Enviar comunicados a toda la institución' },
  { entity: Entity.ANNOUNCEMENTS, action: Action.READ_STATS, group: 'Comunicación', description: 'Ver quién leyó comunicados de otros' },
  { entity: Entity.MESSAGES, action: Action.MANAGE, group: 'Comunicación', description: 'Atender mensajes de familias y estudiantes' },
  { entity: Entity.CLASSROOM_POSTS, action: Action.CREATE, group: 'Comunicación', description: 'Publicar materiales y tareas en las aulas' },
  { entity: Entity.CLASSROOM_POSTS, action: Action.UPDATE, group: 'Comunicación', description: 'Editar y borrar publicaciones de las aulas' },
  { entity: Entity.CHANNELS, action: Action.MODERATE, group: 'Comunicación', description: 'Moderar los canales de curso (ocultar mensajes, silenciar)' },
  { entity: Entity.GRADES, action: Action.READ, group: 'Calificaciones', description: 'Ver todas las notas de su alcance (incluso sin publicar)' },
  { entity: Entity.GRADES, action: Action.UPDATE, group: 'Calificaciones', description: 'Cargar notas de sus materias' },
  { entity: Entity.GRADES, action: Action.UPDATE_ANY, group: 'Calificaciones', description: 'Corregir cualquier nota de su alcance' },
  { entity: Entity.GRADING_PERIODS, action: Action.CLOSE, group: 'Calificaciones', description: 'Cerrar y reabrir períodos' },
  { entity: Entity.GRADING_PERIODS, action: Action.UPDATE, group: 'Calificaciones', description: 'Configurar la calificación de su nivel (modo, escala, períodos)' },
  { entity: Entity.REPORT_CARDS, action: Action.PUBLISH, group: 'Calificaciones', description: 'Publicar boletines a las familias' },
  { entity: Entity.ATTENDANCE, action: Action.READ, group: 'Asistencia', description: 'Ver asistencia de su alcance' },
  { entity: Entity.ATTENDANCE, action: Action.UPDATE, group: 'Asistencia', description: 'Tomar y corregir asistencia' },
  { entity: Entity.ALERTS, action: Action.READ, group: 'Alertas', description: 'Ver el panel de alertas' },
  { entity: Entity.ALERTS, action: Action.UPDATE, group: 'Alertas', description: 'Atender y resolver alertas' },
  { entity: Entity.ALERT_RULES, action: Action.UPDATE, group: 'Alertas', description: 'Configurar reglas de alerta (normativa)' },
  { entity: Entity.SCHOOLS, action: Action.READ, group: 'Plataforma', description: 'Ver todos los colegios de la plataforma' },
  { entity: Entity.SCHOOLS, action: Action.CREATE, group: 'Plataforma', description: 'Dar de alta colegios' },
  { entity: Entity.SCHOOLS, action: Action.UPDATE, group: 'Plataforma', description: 'Renombrar y suspender colegios' },
  { entity: Entity.SCHOOLS, action: Action.DELETE, group: 'Plataforma', description: 'Eliminar colegios definitivamente (con todos sus datos)' },
  { entity: Entity.PLATFORM_BILLING, action: Action.READ, group: 'Plataforma', description: 'Ver la facturación de todos los colegios' },
  { entity: Entity.SUPPORT_REPORTS, action: Action.READ, group: 'Plataforma', description: 'Ver los problemas reportados por los usuarios' },
  { entity: Entity.SUPPORT_REPORTS, action: Action.UPDATE, group: 'Plataforma', description: 'Responder y cerrar reportes de problemas' },
  { entity: Entity.PLATFORM_AUDIT, action: Action.READ, group: 'Plataforma', description: 'Ver actividad, ingresos e IPs de todos los colegios' },
  { entity: Entity.NOTIFICATIONS, action: Action.BROADCAST, group: 'Plataforma', description: 'Enviar avisos a todos los usuarios' },
];

/** Clave única de un permiso, ej: "users:update". Es lo que se guarda en memoria para chequear rápido. */
export type PermissionKey = `${Entity}:${Action}`;
export const permissionKey = (entity: Entity, action: Action): PermissionKey => `${entity}:${action}`;
