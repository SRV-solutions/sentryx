/**
 * Tutoriales de SOLVIX: qué ve cada rol y en qué orden. Cada paso puede llevar a una pantalla (route) y
 * señalar un elemento (target: selector CSS + texto opcional). Si el elemento no está visible (ej: en el
 * celular), SOLVIX lo explica igual en el centro de la pantalla.
 *
 * El orden de la lista es el recorrido sugerido: al terminar uno, SOLVIX ofrece el siguiente que
 * corresponde a ese rol (así la persona va aprendiendo cosas nuevas a medida que avanza).
 */
import type { HelpContext } from '../school/helpIndex';
import { Entity, Action } from '../school/permissions';
import type { SolvixPose } from './Solvix';

export interface TutorialStep {
  title: string;
  text: string;
  /** Pantalla a la que lleva antes de mostrar el paso (ruta con query, ej: /admin?tab=horarios). */
  route?: string;
  /** Elemento a señalar: selector CSS y, opcionalmente, un texto que tiene que contener. */
  target?: { selector: string; text?: string };
  pose?: SolvixPose;
  /** Al tocar "Siguiente", SOLVIX toca el elemento por la persona (ej: abrir una pestaña). */
  clickOnNext?: boolean;
}
export interface Tutorial {
  id: string;
  title: string;
  description: string;
  /** Para el buscador ("tutorial notas", "ayuda asistencia"...). */
  keywords: string[];
  audience: (c: HelpContext) => boolean;
  steps: TutorialStep[];
}

const nav = (path: string) => ({ selector: `.sidebar a[href="${path}"], .bottom-nav a[href="${path}"]` });
const button = (text: string) => ({ selector: 'button, a, label, [role=tab], select', text });
const staff = (c: HelpContext) => !!c.session?.isStaff;
const family = (c: HelpContext) => !!c.session?.isGuardian && !c.session?.isStaff;
const student = (c: HelpContext) => !!c.session?.self && !c.session?.isStaff;
const teacher = (c: HelpContext) => !!c.session?.teaching.length;

export const TUTORIALS: Tutorial[] = [
  {
    id: 'bienvenida',
    title: 'Primeros pasos en Sentryx',
    description: 'El menú, el buscador, las notificaciones y dónde volver a ver estos tutoriales.',
    keywords: ['primeros pasos', 'empezar', 'inicio', 'cómo se usa'],
    audience: (c) => !!c.session,
    steps: [
      { pose: 'wave', title: '¡Hola! Soy SOLVIX 👋', text: 'Soy el astronauta de Sentryx y te voy a mostrar dónde tocar para hacer cada cosa. Podés omitir el tutorial cuando quieras: después lo volvés a ver desde tu perfil.' },
      { route: '/inicio', target: { selector: '.sidebar, .bottom-nav' }, pose: 'point', title: 'El menú', text: 'Desde acá entrás a cada sección. Solo ves lo que corresponde a tu rol en el colegio.' },
      { target: { selector: '.gsearch-input' }, pose: 'point', title: 'El buscador', text: 'Escribí lo que querés hacer, por ejemplo "notas", "faltas" o "tutorial", y te llevo directo.' },
      { target: { selector: 'button[aria-label="Notificaciones"]' }, pose: 'point', title: 'Notificaciones', text: 'Acá te aviso de comunicados, mensajes y todo lo que necesita tu atención.' },
      { target: { selector: '.sidebar a[href="/perfil/me"], a[aria-label="Mi perfil"]' }, pose: 'think', title: 'Tu perfil y tus tutoriales', text: 'En tu perfil está la guía con todos los tutoriales, para repasarlos cuando quieras.' },
      { pose: 'cheer', title: '¡Listo para despegar! 🚀', text: 'Ya conocés lo básico. Si querés, seguimos con lo que más vas a usar.' },
    ],
  },

  // ---------- Conducción y administración ----------
  {
    id: 'asignar-docentes',
    title: 'Asignar docentes a materias',
    description: 'Elegir quién dicta cada materia en cada curso, desde Materias o desde la ficha de la persona.',
    keywords: ['asignar docente', 'docente a materia', 'materias', 'quién dicta', 'profesor'],
    audience: (c) => c.can(Entity.SCHOOL, Action.UPDATE) || !!c.session?.courseLevelIds?.length,
    steps: [
      { route: '/materias', target: nav('/materias'), pose: 'point', title: 'Entrá a Materias', text: 'Las materias de cada curso se manejan desde acá.' },
      { target: button('Asignar docentes'), clickOnNext: true, pose: 'point', title: 'Pestaña "Asignar docentes"', text: 'Muestra curso por curso todas las materias, también las que todavía no tienen docente.' },
      { target: { selector: 'select', text: '+ Asignar docente' }, pose: 'point', title: 'Elegí a la docente', text: 'En cada materia elegís quién la dicta. Si la persona no es docente (por ejemplo, la Rectora), se le suma el rol solo. Con la ✕ se quita.' },
      { pose: 'think', title: 'También desde la ficha', text: 'En Administración → Personal → Editar → Materias le asignás varias materias a una misma persona.' },
      { pose: 'cheer', title: '¡Hecho!', text: 'Con las materias asignadas, cada docente ya puede cargar notas y su horario.' },
    ],
  },
  {
    id: 'alta-personal',
    title: 'Dar de alta al personal',
    description: 'Agregar docentes, preceptores o directivos, con o sin envío de mail.',
    keywords: ['alta de personal', 'agregar docente', 'nuevo docente', 'personal', 'usuario nuevo', 'crear usuario'],
    audience: (c) => c.can(Entity.USERS, Action.UPDATE) && !!c.session?.grantableRoles?.length,
    steps: [
      { route: '/admin?tab=personal', target: nav('/admin'), pose: 'point', title: 'Administración → Personal', text: 'Acá está todo el personal, una fila por persona con sus roles.' },
      { target: button('Agregar'), pose: 'point', title: 'Agregar', text: 'Cargás nombre, DNI o email y el rol. Podés elegir si le mandamos por mail sus datos de acceso: le llega un botón que entra directo y le pide elegir su contraseña.' },
      { target: button('Importar'), pose: 'point', title: 'Muchas personas a la vez', text: 'Con un Excel guardado como CSV das de alta a todo el personal junto.' },
      { target: button('Editar'), pose: 'point', title: 'Editar', text: 'Datos, roles, materias, cargos, horas y sueldo de cada persona, todo en un mismo lugar.' },
      { pose: 'cheer', title: '¡Bienvenidos a bordo!', text: 'Cuando entren por primera vez, les voy a mostrar a ellos cómo usar Sentryx.' },
    ],
  },
  {
    id: 'importar-alumnos',
    title: 'Cargar alumnos y familias',
    description: 'Alta individual o masiva con CSV; si un curso no existe se crea en el momento.',
    keywords: ['alumnos', 'familias', 'csv', 'importar', 'excel', 'inscribir', 'alta de alumnos'],
    audience: (c) => c.can(Entity.USERS, Action.UPDATE),
    steps: [
      { route: '/admin?tab=alumnos', target: button('Alumnos y familias'), pose: 'point', title: 'Alumnos y familias', text: 'Desde esta pestaña cargás alumnos con sus familiares.' },
      { target: button('Descargar plantilla'), pose: 'point', title: 'Descargá la plantilla', text: 'Completala en Excel (una fila por alumno, hasta 2 familiares) y guardala como CSV.' },
      { target: button('Elegir CSV'), pose: 'point', title: 'Subí el archivo', text: 'Si un curso del archivo no existe, te ofrezco crearlo ahí mismo. Los hermanos se vinculan solos a la misma familia.' },
      { pose: 'cheer', title: '¡Listo!', text: 'Al final ves las credenciales de todos (podés imprimirlas o descargarlas) y elegís si mandamos los mails.' },
    ],
  },
  {
    id: 'horarios-recreos',
    title: 'Horarios y recreos del nivel',
    description: 'Entrada, duración del módulo y recreos: los horarios del personal los saltean solos.',
    keywords: ['recreos', 'horarios', 'módulos', 'hora cátedra', 'timbre', 'entrada'],
    audience: (c) => c.can(Entity.GRADING_PERIODS, Action.UPDATE),
    steps: [
      { route: '/admin?tab=horarios', target: button('Horarios'), pose: 'point', title: 'Administración → Horarios', text: 'Cada nivel configura su entrada, la duración del módulo y los recreos.' },
      { target: button('Agregar recreo'), pose: 'point', title: 'Agregá los recreos', text: 'Desde qué hora y cuántos minutos. Si un recreo es solo de la tarde, elegí el turno.' },
      { target: button('Guardar horario'), pose: 'point', title: 'Guardá', text: 'Abajo ves cómo queda el día. Desde ahora, al cargar módulos de un docente la hora de fin saltea los recreos.' },
      { pose: 'cheer', title: '¡Perfecto!', text: 'En Mi legajo y en las fichas el horario se ve módulo por módulo con los recreos.' },
    ],
  },
  {
    id: 'cargos-horas',
    title: 'Cargar horas, horario y sueldo',
    description: 'Cargos, módulos por materia, armado automático del horario y sueldo mensual.',
    keywords: ['horas', 'cargos', 'sueldo', 'horario docente', 'módulos', 'legajo', 'cuánto cobra'],
    audience: (c) => c.can(Entity.STAFF_RECORDS, Action.UPDATE),
    steps: [
      { route: '/admin?tab=personal', target: button('Editar'), pose: 'point', title: 'Elegí a la persona', text: 'En Personal, tocá "Editar" en la persona y andá a "Cargos y sueldo".' },
      { pose: 'think', title: 'Agregar cargo u horas', text: 'Elegís el cargo entre sus roles (si es docente, "Docente"), el total semanal y la duración del módulo.' },
      { pose: 'point', title: 'Armar horario automático', text: 'Elegís los días, la entrada y los módulos por día: armo las franjas salteando los recreos. "Repartir lo que falta" completa las horas semanales.' },
      { pose: 'cheer', title: 'Y el sueldo', text: 'Con el valor de la hora cátedra (o el monto fijo) calculo cuánto cobra por mes cada cargo y en total.' },
    ],
  },
  {
    id: 'comunicado',
    title: 'Enviar un comunicado',
    description: 'A un curso, un nivel, toda la escuela o familias elegidas; con confirmación de lectura.',
    keywords: ['comunicado', 'circular', 'aviso', 'enviar a las familias'],
    audience: (c) => c.can(Entity.ANNOUNCEMENTS, Action.CREATE),
    steps: [
      { route: '/comunicados', target: nav('/comunicados'), pose: 'point', title: 'Comunicados', text: 'Acá están los recibidos y los enviados, con quién leyó y quién confirmó.' },
      { target: button('Nuevo comunicado'), pose: 'point', title: 'Nuevo comunicado', text: 'Elegís a quién va, escribís, adjuntás archivos y podés pedir confirmación, guardarlo como borrador o programarlo.' },
      { pose: 'cheer', title: '¡Enviado!', text: 'Les llega una notificación y ves en el momento quién lo leyó.' },
    ],
  },

  // ---------- Docentes ----------
  {
    id: 'docente-notas',
    title: 'Cargar notas',
    description: 'Planilla de calificaciones por materia y período.',
    keywords: ['notas', 'calificaciones', 'planilla', 'cargar notas', 'boletín'],
    audience: (c) => teacher(c),
    steps: [
      { route: '/materias', target: nav('/materias'), pose: 'point', title: 'Materias', text: 'Acá están tus materias, agrupadas por curso, con lo que falta cargar.' },
      { target: { selector: 'a.card-link' }, pose: 'point', title: 'Elegí una materia', text: 'Entrás a la planilla: cargás la nota de cada alumno en cada período y se guarda sola.' },
      { pose: 'cheer', title: '¡Así de fácil!', text: 'Cuando la conducción publica el boletín, las familias ven las notas.' },
    ],
  },
  {
    id: 'asistencia',
    title: 'Tomar asistencia',
    description: 'Presentes, ausentes, tardes y retiros por curso.',
    keywords: ['asistencia', 'faltas', 'presentes', 'ausentes', 'tomar lista'],
    audience: (c) => c.can(Entity.ATTENDANCE, Action.UPDATE),
    steps: [
      { route: '/asistencia', target: nav('/asistencia'), pose: 'point', title: 'Asistencia', text: 'Elegís el curso y marcás a cada alumno. Por defecto todos están presentes.' },
      { pose: 'cheer', title: '¡Lista tomada!', text: 'Si alguien acumula faltas, aparece en Alertas para que nadie se quede atrás.' },
    ],
  },
  {
    id: 'aulas',
    title: 'Publicar en el aula',
    description: 'Material, tareas, fotos y videos para un curso.',
    keywords: ['aula', 'publicar', 'material', 'tarea', 'clase'],
    audience: (c) => teacher(c),
    steps: [
      { route: '/aulas', target: nav('/aulas'), pose: 'point', title: 'Aulas', text: 'Cada curso tiene su aula. Entrá a una para publicar material o tareas.' },
      { pose: 'think', title: 'Archivos', text: 'Podés subir archivos o elegir de "Mis archivos" algo que ya subiste. Máximo 1 GB por archivo.' },
      { pose: 'cheer', title: '¡A enseñar!', text: 'Las familias y los alumnos lo ven al instante.' },
    ],
  },
  {
    id: 'mi-legajo',
    title: 'Mi legajo y mi horario',
    description: 'Tus cargos, tu horario por módulos con recreos y tus recibos.',
    keywords: ['mi legajo', 'mi horario', 'recibo', 'sueldo', 'horas'],
    audience: (c) => staff(c),
    steps: [
      { route: '/mi-legajo', target: nav('/mi-legajo'), pose: 'point', title: 'Mi legajo', text: 'Tus cargos, horas y cuánto vas a cobrar aproximadamente por mes.' },
      { target: { selector: '.chips', text: 'Semana' }, pose: 'point', title: 'Tu horario', text: 'Lo ves por semana, por materia, por curso o por cargo, con los recreos marcados.' },
      { pose: 'cheer', title: '¡Todo en orden!', text: 'Si algo no coincide, avisale a la administración del colegio.' },
    ],
  },

  // ---------- Familias y estudiantes ----------
  {
    id: 'familia',
    title: 'Seguir a mis hijos',
    description: 'Notas publicadas, asistencia y datos de cada hijo/a.',
    keywords: ['mis hijos', 'notas de mi hijo', 'boletín', 'faltas de mi hijo'],
    audience: (c) => family(c),
    steps: [
      { route: '/familia', target: nav('/familia'), pose: 'point', title: 'Tus hijos', text: 'Entrás a cada hijo/a para ver notas publicadas, boletín y asistencia.' },
      { target: nav('/comunicados'), pose: 'point', title: 'Comunicados', text: 'Los avisos del colegio. Si piden confirmación, tocá "Confirmar" para que sepan que lo leíste.' },
      { target: nav('/mensajes'), pose: 'point', title: 'Mensajes', text: 'Escribile a la docente o a la escuela sobre tu hijo/a.' },
      { pose: 'cheer', title: '¡Listo!', text: 'Activá las notificaciones para enterarte al instante.' },
    ],
  },
  {
    id: 'estudiante',
    title: 'Mi curso',
    description: 'Aulas, canales, mensajes, boletín y juegos.',
    keywords: ['estudiante', 'mi boletín', 'canales', 'juegos', 'aulas'],
    audience: (c) => student(c),
    steps: [
      { route: '/aulas', target: nav('/aulas'), pose: 'point', title: 'Aulas', text: 'El material y las tareas de cada materia.' },
      { target: nav('/canales'), pose: 'point', title: 'Canales', text: 'Hablá con tu curso. Los canales los modera el personal.' },
      { target: nav('/juegos'), pose: 'point', title: 'Juegos', text: 'Las preguntas y juegos que te asignan tus docentes.' },
      { pose: 'cheer', title: '¡A estudiar!', text: 'Tu boletín aparece cuando el colegio lo publica.' },
    ],
  },
];

/** Tutoriales que le corresponden a quien mira, en el orden sugerido. */
export const tutorialsFor = (c: HelpContext) => TUTORIALS.filter((t) => t.audience(c));
export const tutorialById = (id: string) => TUTORIALS.find((t) => t.id === id);
