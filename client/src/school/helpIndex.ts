import type { SchoolSession } from './types';
import { Entity, Action } from './permissions';
import { PlanFeature } from './plans';

/**
 * Índice de todo lo que se puede hacer en Sentryx: lo usa el buscador global (Ctrl+K) y la página
 * de Ayuda. Cada entrada sabe adónde lleva y quién puede verla. Las palabras clave están pensadas
 * para cómo lo diría una directora ("notas", "boletín", "faltas", "cuota"), no para cómo se llama el módulo.
 */
export interface HelpEntry {
  id: string;
  title: string;
  description: string;
  path: string;
  section: string;
  keywords: string[];
  /** Quién la ve. Sin filtro = todos los que tienen sesión en un colegio. */
  show?: (ctx: HelpContext) => boolean;
}
export interface HelpContext {
  session: SchoolSession | null;
  can: (entity: Entity, action: Action) => boolean;
  isSuperAdmin: boolean;
}

const staff = (c: HelpContext) => !!c.session?.isStaff;
const family = (c: HelpContext) => !!c.session && !c.session.isStaff;
const has = (c: HelpContext, f: PlanFeature) => !!c.session?.plan?.features.includes(f);

export const HELP_INDEX: HelpEntry[] = [
  // --- Inicio y comunicación ---
  { id: 'inicio', title: 'Inicio', description: 'Resumen del día: comunicados sin leer, mensajes, alertas y asistencia.', path: '/inicio', section: 'Inicio', keywords: ['inicio', 'home', 'resumen', 'panel', 'tablero'] },
  { id: 'comunicados', title: 'Comunicados recibidos', description: 'Bandeja con búsqueda y filtros (sin leer, pendientes de confirmar, urgentes, adjuntos, archivados).', path: '/comunicados', section: 'Comunicación', keywords: ['comunicados', 'avisos', 'circulares', 'notas a las familias', 'bandeja', 'buscar comunicado'] },
  { id: 'comunicado-nuevo', title: 'Enviar un comunicado', description: 'A divisiones, a un nivel, a toda la escuela, al personal o a familias elegidas una por una. Se puede guardar como borrador o programar.', path: '/comunicados/nuevo', section: 'Comunicación', keywords: ['enviar comunicado', 'nuevo comunicado', 'circular', 'programar', 'borrador', 'familias', 'cuota', 'administración'], show: (c) => c.can(Entity.ANNOUNCEMENTS, Action.CREATE) },
  { id: 'comunicados-enviados', title: 'Comunicados enviados', description: 'Quién leyó y quién confirmó cada comunicado; borradores, programados y archivados.', path: '/comunicados', section: 'Comunicación', keywords: ['enviados', 'leído', 'confirmación', 'notificado', 'quién leyó', 'borradores', 'programados'], show: (c) => c.can(Entity.ANNOUNCEMENTS, Action.CREATE) },
  { id: 'mensajes', title: 'Mensajes', description: 'Conversaciones privadas familia ↔ escuela sobre un alumno.', path: '/mensajes', section: 'Comunicación', keywords: ['mensajes', 'chat', 'conversación', 'escribir', 'hablar con la docente', 'hablar con la familia'] },
  { id: 'mensaje-nuevo', title: 'Escribir un mensaje', description: 'Elegir alumno y destinatario y empezar una conversación.', path: '/mensajes/nuevo', section: 'Comunicación', keywords: ['nuevo mensaje', 'escribir mensaje', 'contactar'] },
  { id: 'canales', title: 'Canales', description: 'Canales de curso para estudiantes de Secundario, moderados por el personal.', path: '/canales', section: 'Comunicación', keywords: ['canales', 'grupo', 'curso', 'moderar'], show: (c) => !!c.session?.hasChannels },

  // --- Alumnos y familias ---
  { id: 'alumnos', title: 'Alumnos', description: 'Listado de alumnos por curso: ficha, boletín, asistencia, familia, cambio de curso y bajas.', path: '/alumnos', section: 'Alumnos', keywords: ['alumnos', 'estudiantes', 'legajo del alumno', 'ficha', 'buscar alumno', 'cambio de curso', 'baja', 'pase', 'reincorporar'], show: (c) => c.can(Entity.USERS, Action.READ) },
  { id: 'alumno-boletin', title: 'Boletín de un alumno', description: 'En la ficha del alumno, pestaña Boletín. Incluye los boletines de años anteriores (selector de ciclo).', path: '/alumnos', section: 'Alumnos', keywords: ['boletín', 'boletines', 'notas del alumno', 'notas alumnos', 'libreta', 'calificaciones', 'ciclo anterior', 'año pasado', 'imprimir boletín'], show: (c) => c.can(Entity.USERS, Action.READ) },
  { id: 'alumno-asistencia', title: 'Asistencia de un alumno', description: 'En la ficha del alumno, pestaña Asistencia: faltas, tardes, justificadas y porcentaje.', path: '/alumnos', section: 'Alumnos', keywords: ['faltas de un alumno', 'inasistencias', 'asistencia del alumno', 'justificar falta'], show: (c) => c.can(Entity.USERS, Action.READ) },
  { id: 'alumno-familia', title: 'Familia de un alumno', description: 'En la ficha del alumno, pestaña Datos: madre, padre, tutores, autorizados a retirar, cuenta de estudiante.', path: '/alumnos', section: 'Alumnos', keywords: ['familia', 'padres', 'tutores', 'vincular familiar', 'autorizado a retirar', 'cuenta del estudiante', 'contraseña del alumno'], show: (c) => c.can(Entity.USERS, Action.READ) },
  { id: 'familia', title: 'Mi hijo/a', description: 'Boletín publicado, asistencia, aula y comunicados de tus hijos.', path: '/familia', section: 'Familia', keywords: ['mi hijo', 'mis hijos', 'boletín', 'notas', 'faltas'], show: family },

  // --- Notas ---
  { id: 'materias', title: 'Materias y planilla de notas', description: 'Cargar notas por materia y período (carga rápida a todo el curso), cerrar períodos y publicar boletines.', path: '/materias', section: 'Notas', keywords: ['notas', 'cargar notas', 'planilla', 'calificaciones', 'materias', 'bimestre', 'trimestre', 'cuatrimestre', 'nota de cuatrimestre', 'promedio', 'cerrar período', 'publicar boletín'], show: (c) => !!c.session?.teaching.length || c.can(Entity.GRADES, Action.READ) },
  { id: 'publicar-boletin', title: 'Publicar boletines a las familias', description: 'Desde la planilla de notas de cada materia (botón Publicar). Solo conducción.', path: '/materias', section: 'Notas', keywords: ['publicar boletín', 'publicar notas', 'familias ven las notas', 'boletín visible'], show: (c) => c.can(Entity.REPORT_CARDS, Action.PUBLISH) },
  { id: 'estado-division', title: 'Estado académico de un curso', description: 'Alumnos con materias en riesgo, por curso.', path: '/materias', section: 'Notas', keywords: ['en riesgo', 'desaprobados', 'estado académico', 'materias adeudadas', 'bajas notas'], show: (c) => c.can(Entity.GRADES, Action.READ) },
  { id: 'periodos', title: 'Cómo se califica en cada nivel', description: 'Modo por defecto del nivel (solo números, solo letras, informes o mixto), escala, rangos, tipo de nota de cada período, esquema trimestral/bimestral y nota de cuatrimestre.', path: '/admin?tab=calificaciones', section: 'Notas', keywords: ['períodos', 'bimestres', 'trimestres', 'cuatrimestre', 'fechas de los períodos', 'esquema de evaluación', 'modo de calificación', 'tipo de nota', 'numérica', 'letras', 'conceptual', 'informes', 'escala', 'nota de aprobación', 'configurar boletín'], show: (c) => c.can(Entity.GRADING_PERIODS, Action.UPDATE) },

  // --- Asistencia ---
  { id: 'asistencia', title: 'Tomar asistencia', description: 'Pase de lista por curso y día: presente, ausente, tarde, retiro; justificar.', path: '/asistencia', section: 'Asistencia', keywords: ['asistencia', 'tomar lista', 'pasar lista', 'presentes', 'ausentes', 'tarde', 'retiro', 'justificar'], show: (c) => c.can(Entity.ATTENDANCE, Action.UPDATE) },
  { id: 'alertas', title: 'Alertas de asistencia', description: 'Alumnos que superan los límites de faltas; reglas por nivel.', path: '/alertas', section: 'Asistencia', keywords: ['alertas', 'faltas', 'inasistencias', 'límite de faltas', 'reglas de asistencia', 'libre'], show: (c) => c.can(Entity.ALERTS, Action.READ) },
  { id: 'estadisticas', title: 'Estadísticas por curso', description: 'Gráficos de asistencia, inasistencias y llegadas tarde por mes, y promedios de notas por materia, para cada curso.', path: '/estadisticas', section: 'Asistencia', keywords: ['estadísticas', 'gráficos', 'promedio del curso', 'promedios', 'inasistencias por curso', 'llegadas tarde', 'porcentaje de asistencia', 'indicadores', 'panel directivo'], show: (c) => c.can(Entity.ATTENDANCE, Action.READ) && c.can(Entity.GRADES, Action.READ) && staff(c) },

  // --- Aulas ---
  { id: 'aulas', title: 'Aulas', description: 'Muro de cada curso: materiales, tareas, trabajos prácticos y evaluaciones por materia.', path: '/aulas', section: 'Aulas', keywords: ['aulas', 'aula virtual', 'muro', 'material', 'tarea', 'tp', 'trabajo práctico', 'evaluación', 'prueba', 'examen', 'fecha de entrega', 'agenda'] },
  { id: 'archivos', title: 'Archivos', description: 'Todo lo que subiste: espacio usado y límite de tu plan.', path: '/archivos', section: 'Aulas', keywords: ['archivos', 'espacio', 'almacenamiento', 'gb', 'subir archivo'], show: (c) => staff(c) && (!!c.session?.teaching.length || c.can(Entity.ANNOUNCEMENTS, Action.CREATE)) },
  { id: 'juegos', title: 'Juegos de preguntas', description: 'Cuestionarios tipo Kahoot: en vivo con PIN y QR, o como tarea con fecha.', path: '/juegos', section: 'Aulas', keywords: ['juegos', 'kahoot', 'quiz', 'preguntas', 'trivia', 'en vivo', 'pin'], show: (c) => c.can(Entity.QUIZZES, Action.CREATE) || (!staff(c) && has(c, PlanFeature.QUIZZES)) },
  { id: 'programas', title: 'Programas de las materias', description: 'Programa por materia y curso, con unidades.', path: '/programas', section: 'Aulas', keywords: ['programas', 'programa de la materia', 'planificación', 'unidades', 'contenidos'], show: (c) => c.can(Entity.SUBJECT_PROGRAMS, Action.CREATE) || c.can(Entity.SUBJECT_PROGRAMS, Action.READ) || (!staff(c) && has(c, PlanFeature.SUBJECT_PROGRAMS)) },
  { id: 'calendario', title: 'Calendario y actos', description: 'Feriados nacionales, actos escolares y eventos con encargados.', path: '/calendario', section: 'Aulas', keywords: ['calendario', 'actos', 'eventos', 'feriados', 'fechas', 'efemérides'], show: (c) => staff(c) || has(c, PlanFeature.EVENTS) },

  // --- Personas y personal ---
  { id: 'personas', title: 'Personas', description: 'Todas las personas del colegio: personal, familias y estudiantes, con sus roles y accesos.', path: '/personas', section: 'Personas', keywords: ['personas', 'usuarios', 'cuentas', 'buscar persona', 'docentes', 'familias', 'contraseña', 'blanquear contraseña', 'reset'], show: (c) => c.can(Entity.USERS, Action.READ) },
  { id: 'personal', title: 'Personal (alta y roles)', description: 'Dar de alta personal, asignar uno o más roles (nivel, divisiones), importar por CSV, desactivar.', path: '/admin?tab=personal', section: 'Personas', keywords: ['personal', 'alta de docente', 'agregar docente', 'agregar preceptor', 'roles', 'varios roles', 'importar csv', 'credenciales', 'probar ingreso'], show: (c) => c.can(Entity.USERS, Action.UPDATE) },
  { id: 'roles', title: 'Roles y permisos', description: 'Qué puede hacer cada rol; crear roles personalizados eligiendo permisos (acciones concretas).', path: '/admin?tab=roles', section: 'Personas', keywords: ['roles', 'permisos', 'crear rol', 'rol personalizado', 'qué puede hacer', 'jerarquía', 'coordinador'], show: (c) => c.can(Entity.USERS, Action.UPDATE) },
  { id: 'legajo', title: 'Legajo del personal', description: 'Cargos, horas, turnos y horario de cada persona del personal.', path: '/personal', section: 'Personas', keywords: ['legajo', 'cargos', 'horas cátedra', 'turnos', 'horario', 'personal'], show: (c) => c.can(Entity.STAFF_RECORDS, Action.READ) },
  { id: 'recibos', title: 'Recibos de sueldo', description: 'Subir recibos (PDF) y ver la conformidad de cada persona.', path: '/personal', section: 'Personas', keywords: ['recibos', 'sueldo', 'recibo de sueldo', 'haberes', 'conformidad'], show: (c) => c.can(Entity.PAYROLL, Action.READ) },
  { id: 'mi-legajo', title: 'Mi legajo', description: 'Tus cargos, horario y recibos de sueldo.', path: '/mi-legajo', section: 'Personas', keywords: ['mi legajo', 'mis recibos', 'mi horario', 'mis cargos'], show: staff },

  // --- Administración ---
  { id: 'admin', title: 'Administración', description: 'Datos del colegio, estructura (niveles, cursos, materias, períodos), personal, roles, ciclo lectivo y auditoría.', path: '/admin', section: 'Administración', keywords: ['administración', 'configuración', 'ajustes', 'colegio', 'datos del colegio', 'logo'], show: (c) => c.can(Entity.SCHOOL, Action.UPDATE) || c.can(Entity.USERS, Action.UPDATE) },
  { id: 'estructura', title: 'Estructura: niveles, cursos y materias', description: 'Crear la estructura por defecto, editar divisiones, materias y docentes por materia.', path: '/admin?tab=estructura', section: 'Administración', keywords: ['estructura', 'cursos', 'divisiones', 'grados', 'años', 'salas', 'materias', 'asignar docente', 'niveles', 'secciones'], show: (c) => c.can(Entity.SCHOOL, Action.UPDATE) },
  { id: 'ciclo', title: 'Ciclo lectivo y promoción anual', description: 'Preparar el ciclo siguiente y pasar de grado a los alumnos (promueve, repite, egresa).', path: '/admin?tab=ciclo', section: 'Administración', keywords: ['ciclo lectivo', 'promoción', 'pasar de grado', 'año siguiente', 'egresados', 'repite', 'nuevo ciclo'], show: (c) => c.can(Entity.SCHOOL, Action.UPDATE) },
  { id: 'auditoria', title: 'Auditoría', description: 'Quién hizo qué y cuándo (con IP): altas, cambios, publicaciones, ingresos.', path: '/admin?tab=auditoria', section: 'Administración', keywords: ['auditoría', 'historial', 'quién cambió', 'registro de actividad', 'ingresos', 'ip'], show: (c) => c.can(Entity.AUDIT_LOG, Action.READ) },
  { id: 'planes', title: 'Planes por persona', description: 'Qué plan tiene cada docente o familia (Básico, Ampliado, Profesional, Integral) y los pedidos de cambio.', path: '/planes', section: 'Administración', keywords: ['planes', 'plan', 'básico', 'ampliado', 'profesional', 'integral', 'espacio', 'funciones'], show: (c) => c.can(Entity.PLANS, Action.READ) },
  { id: 'facturacion', title: 'Facturación', description: 'Resumen mensual de lo que paga el colegio por persona y plan.', path: '/facturacion', section: 'Administración', keywords: ['facturación', 'factura', 'cobro', 'cuánto se paga', 'precio', 'abono', 'mensual'], show: (c) => c.can(Entity.BILLING, Action.READ) },

  // --- Cuenta ---
  { id: 'perfil', title: 'Mi perfil', description: 'Tu foto, tus datos y cambiar tu contraseña.', path: '/perfil/me', section: 'Mi cuenta', keywords: ['perfil', 'mi cuenta', 'contraseña', 'cambiar contraseña', 'foto', 'avatar', 'notificaciones'] },
  { id: 'ayuda', title: 'Ayuda e índice', description: 'Todo lo que se puede hacer en Sentryx, por sección, con un buscador.', path: '/ayuda', section: 'Mi cuenta', keywords: ['ayuda', 'índice', 'documentación', 'manual', 'cómo', 'dónde está', 'buscar'] },

  // --- Plataforma (equipo Sentryx) ---
  { id: 'plataforma', title: 'Colegios de la plataforma', description: 'Alta, suspensión y eliminación de colegios.', path: '/plataforma', section: 'Plataforma', keywords: ['plataforma', 'colegios', 'alta de colegio', 'superadmin', 'eliminar colegio'], show: (c) => c.isSuperAdmin },
  { id: 'plataforma-fact', title: 'Facturación global', description: 'Lo que paga cada colegio.', path: '/plataforma/facturacion', section: 'Plataforma', keywords: ['facturación global', 'cobros', 'todos los colegios'], show: (c) => c.isSuperAdmin },
  { id: 'plataforma-reportes', title: 'Reportes de usuarios', description: 'Problemas y sugerencias que reportan los usuarios.', path: '/plataforma/reportes', section: 'Plataforma', keywords: ['reportes', 'problemas', 'soporte', 'sugerencias'], show: (c) => c.isSuperAdmin },
];

const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Entradas visibles para quien mira, ordenadas por sección. */
export const visibleHelp = (ctx: HelpContext) => HELP_INDEX.filter((e) => !e.show || e.show(ctx));

/**
 * Búsqueda tolerante: coincide por título, palabra clave o descripción, sin acentos ni mayúsculas.
 * Puntúa más el título y las palabras clave que la descripción; con varias palabras, todas deben aparecer.
 */
export const searchHelp = (ctx: HelpContext, query: string, limit = 8) => {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  return visibleHelp(ctx)
    .map((e) => {
      const title = norm(e.title);
      const keys = e.keywords.map(norm);
      const desc = norm(e.description);
      let score = 0;
      for (const w of words) {
        if (title.startsWith(w)) score += 6;
        else if (title.includes(w)) score += 4;
        if (keys.some((k) => k === w)) score += 5;
        else if (keys.some((k) => k.startsWith(w))) score += 4;
        else if (keys.some((k) => k.includes(w))) score += 3;
        if (desc.includes(w)) score += 1;
      }
      const all = words.every((w) => title.includes(w) || keys.some((k) => k.includes(w)) || desc.includes(w));
      return { entry: e, score: all ? score : 0 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.entry);
};
