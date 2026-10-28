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
// Pestañas (Tabs): solo [role=tab], así "Materias" o "Calendario" no se confunden con el link del menú.
const tab = (text: string) => ({ selector: '[role=tab]', text });
// En escritorio dice "Nuevo comunicado" y en el celular es el botón flotante "Nuevo": se busca por el link.
const newComm = { selector: 'a[href="/comunicados/nuevo"]' };
// "Mi perfil" del estudiante es su ficha (/familia/:id): el id cambia, se busca por el comienzo.
const studentProfileNav = { selector: '.sidebar a[href^="/familia/"], .bottom-nav a[href^="/familia/"]' };
const staff = (c: HelpContext) => !!c.session?.isStaff;
const family = (c: HelpContext) => !!c.session?.isGuardian && !c.session?.isStaff;
const student = (c: HelpContext) => !!c.session?.self && !c.session?.isStaff;
const teacher = (c: HelpContext) => !!c.session?.teaching.length;
// Convivencia: carga quien tiene conduct:create (configurable en Roles) y llega a la ficha desde Alumnos.
const conductWriter = (c: HelpContext) => staff(c) && c.can(Entity.CONDUCT, Action.CREATE) && c.can(Entity.USERS, Action.READ);

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
      { target: nav('/comunicados'), pose: 'point', title: 'Comunicados', text: 'Los avisos del colegio y tus charlas están juntos acá: "Recibidos", "Conversaciones" (las respuestas, siempre privadas) y "Enviados".' },
      { target: { selector: '.gsearch-input' }, pose: 'point', title: 'El buscador', text: 'Escribí lo que querés hacer, por ejemplo "notas", "faltas" o "tutorial", y te llevo directo. Las notificaciones (la campanita) te avisan de lo nuevo.' },
      { target: { selector: '.sidebar a[href="/perfil/me"], a[aria-label="Mi perfil"], a[aria-label="Mi cuenta"]' }, pose: 'think', title: 'Tu perfil y tus tutoriales', text: 'En tu perfil está la guía con todos los tutoriales, para repasarlos cuando quieras.' },
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
    description: 'A un alumno, un curso, un nivel, toda la escuela o personas elegidas; a las familias, a los estudiantes o a ambos, y con respuestas.',
    keywords: ['comunicado', 'circular', 'aviso', 'enviar a las familias', 'enviar a un alumno', 'escribir a los estudiantes', 'urgente', 'permitir respuestas'],
    audience: (c) => staff(c) && c.can(Entity.ANNOUNCEMENTS, Action.CREATE),
    steps: [
      { route: '/comunicados', target: newComm, pose: 'point', title: 'Comunicados', text: 'En "Recibidos", "Conversaciones" y "Enviados" está todo: quién leyó, quién confirmó y quién respondió. Para escribir, "Nuevo comunicado".' },
      { route: '/comunicados/nuevo', target: { selector: 'section[aria-labelledby="aud-h"]' }, pose: 'point', title: '¿A quién?', text: 'Alumnos (uno solo o varios, por nombre), Cursos, Niveles, Familias elegidas, Personal o Personas puntuales (colegas, familias o estudiantes).' },
      { target: { selector: '[aria-label="¿Quién lo recibe?"]' }, pose: 'point', title: '¿Quién lo recibe?', text: 'Si va a alumnos, cursos o niveles, elegís si les llega a las familias, a los estudiantes o a ambos. Los estudiantes lo reciben si tienen cuenta (Secundario).' },
      { target: { selector: 'button', text: 'Sumar más gente' }, pose: 'point', title: 'Sumar más gente', text: 'Para que también lo reciba alguien más: la preceptora, otro docente o una familia puntual.' },
      { target: { selector: 'select[aria-label="Tipo de comunicado"]' }, pose: 'point', title: 'Tipo y Urgente', text: 'El tipo (Institucional, Académico, Convivencia…) ayuda a filtrarlo. Si marcás "Urgente", además sale por email.' },
      { target: { selector: 'label.check', text: 'Permitir respuestas' }, pose: 'cheer', title: 'Permitir respuestas', text: 'Cada respuesta te llega solo a vos, en una conversación privada. Podés pedir confirmación de lectura, guardarlo como borrador o programarlo. Después, "Enviar". ¡Listo!' },
    ],
  },
  {
    id: 'sin-email',
    title: 'Emails de estudiantes',
    description: 'Quiénes no tienen email (no podrían recuperar su contraseña), cómo avisarles a sus familias y cómo pedirle a un estudiante que cambie un email que no es real.',
    keywords: ['sin email', 'sin mail', 'email del estudiante', 'emails de estudiantes', 'recuperar contraseña', 'cuenta del estudiante', 'avisar a las familias', 'pedir cambio de email', 'email falso'],
    audience: (c) => staff(c) && c.can(Entity.ALERTS, Action.READ),
    steps: [
      { route: '/alertas?tab=emails', target: nav('/alertas'), pose: 'point', title: 'Alertas', text: 'Además de las faltas, acá te aviso de las cuentas de estudiantes que necesitan algo.' },
      { target: tab('Emails de estudiantes'), pose: 'point', title: 'Pestaña "Emails de estudiantes"', text: 'La cuenta se crea sola cuando el estudiante entra a Secundario y entra con su DNI. Sin email puede cambiar la contraseña, pero si la olvida no la puede recuperar.' },
      { target: { selector: '.chips', text: 'Con email' }, pose: 'point', title: 'Sin email, Con email, Todos', text: 'En "Sin email" están los que les falta (y los que todavía no tienen cuenta). En "Con email" ves el email que cargó cada uno.' },
      { target: { selector: 'button', text: 'Avisar a las familias' }, pose: 'point', title: 'Avisar a las familias', text: 'Les llega por la plataforma y por email para que lo carguen desde Sentryx. La familia lo puede cargar solo si falta. Si elegís algunos, se avisa solo a esos; a quien avisaste hace menos de 7 días no se le repite.' },
      { target: { selector: 'button', text: 'Pedir cambio de email' }, pose: 'think', title: 'Pedir cambio de email', text: 'Si un email no parece real, marcá al estudiante y pedile que lo cambie (podés poner el motivo). Le aparece en su inicio hasta que lo cambie desde su perfil.' },
      { target: { selector: 'button', text: 'Cargar email' }, pose: 'point', title: 'Cargar email', text: 'Si ya tenés el email, cargalo vos. Tiene que ser del estudiante: el de la mamá o el papá suele estar usado por su propia cuenta.' },
      { pose: 'cheer', title: '¡Cuentas al día!', text: 'Cuando la familia o el estudiante cargan el email, sale solo de "Sin email". Si a alguien le falta la cuenta (estaba en Secundario desde antes), usá "Crear cuentas del curso".' },
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
    description: 'Material, tareas, fotos y videos para un curso, y su calendario.',
    keywords: ['aula', 'publicar', 'material', 'tarea', 'clase', 'evaluación con fecha'],
    audience: (c) => teacher(c),
    steps: [
      { route: '/aulas', target: nav('/aulas'), pose: 'point', title: 'Aulas', text: 'Cada curso tiene su aula. Entrá a una para publicar material o tareas.' },
      { pose: 'think', title: 'Archivos', text: 'Podés subir archivos o elegir de "Mis archivos" algo que ya subiste. Máximo 1 GB por archivo.' },
      { pose: 'point', title: 'Calendario del aula', text: 'Las evaluaciones, los TP y las tareas con fecha que publicás aparecen solos en la pestaña "Calendario" del aula, junto con los actos y los feriados.' },
      { pose: 'point', title: '¿Vas a faltar?', text: 'Avisalo en Mi legajo → "Avisar que voy a faltar": les llega a tus alumnos y sus familias, y se marca en el horario del aula y en el calendario.' },
      { pose: 'cheer', title: '¡A enseñar!', text: 'Las familias y los alumnos lo ven al instante.' },
    ],
  },
  {
    id: 'convivencia',
    title: 'Registrar en convivencia',
    description: 'El historial de convivencia de cada alumno: qué pasó y cuándo. No se edita ni se borra.',
    keywords: ['convivencia', 'amonestación', 'sanción', 'suspensión', 'llamado de atención', 'observación', 'acta', 'reconocimiento', 'conducta'],
    audience: conductWriter,
    steps: [
      { route: '/alumnos', target: nav('/alumnos'), pose: 'point', title: 'Alumnos', text: 'Buscá al alumno por nombre o DNI. También llegás desde Aulas → el curso → "Integrantes".' },
      { target: { selector: 'a.list-item[href^="/alumnos/"]' }, clickOnNext: true, pose: 'point', title: 'Elegí al alumno', text: 'Te abro uno como ejemplo; después vos elegís el que necesites.' },
      { target: tab('Convivencia'), clickOnNext: true, pose: 'point', title: 'Pestaña "Convivencia"', text: 'El historial completo, con las amonestaciones y los días de suspensión del ciclo.' },
      { target: { selector: 'button', text: 'Registrar' }, pose: 'point', title: 'Registrar', text: 'Fecha, tipo (observación, llamado de atención, amonestación, suspensión, reconocimiento…), qué pasó y la medida. Elegís si lo ve la familia y si le avisamos: le llega por la app y por email.' },
      { target: { selector: 'p', text: 'no se puede editar ni borrar' }, pose: 'think', title: 'No se edita ni se borra', text: 'Queda como historial. Si hubo un error, tocá "Rectificar" en el registro: la rectificación se agrega debajo y el original queda como estaba.' },
      { pose: 'cheer', title: '¡Registrado!', text: 'Cada registro guarda quién lo cargó y cuándo. Lo interno (no visible para la familia) solo lo ve el personal con acceso a convivencia.' },
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
    description: 'Materias y notas publicadas, convivencia, y cómo escribirle a la escuela.',
    keywords: ['mis hijos', 'notas de mi hijo', 'materias de mi hijo', 'boletín', 'faltas de mi hijo', 'convivencia de mi hijo'],
    audience: (c) => family(c),
    steps: [
      { route: '/familia', target: nav('/familia'), pose: 'point', title: 'Tus hijos', text: 'Entrás a cada hijo/a (si tenés más de uno, elegilo de la lista). Si su cuenta de estudiante no tiene email, arriba te aparece un aviso con "Cargar email" para que pueda recuperar su contraseña. Si ya tiene, lo cambia tu hijo/a desde su perfil o la escuela.' },
      // Con un solo hijo/a la página ya entra a su ficha y este paso no encuentra la lista (se saltea); con más, abre el primero.
      { target: { selector: 'a.list-item[href^="/familia/"]' }, clickOnNext: true, pose: 'point', title: 'Elegí a tu hijo/a', text: 'Si tenés más de uno, te abro el primero como ejemplo; después entrás al que quieras. Con un solo hijo/a ya estás en su ficha.' },
      { target: tab('Materias'), pose: 'point', title: 'Materias y notas', text: 'Cada materia con sus docentes y las notas de cada período, a medida que el colegio publica el boletín. Tocá una para ver el detalle.' },
      { target: tab('Convivencia'), pose: 'think', title: 'Convivencia', text: 'Qué pasó y cuándo: observaciones, sanciones y también reconocimientos. Cuando la escuela registra algo, te llega un aviso.' },
      { route: '/comunicados', target: newComm, pose: 'point', title: 'Escribirle a la escuela', text: 'Los avisos del colegio llegan a "Recibidos" (si piden confirmación, tocá "Confirmo que lo leí"). Para escribirle a la docente, a preceptoría o a la conducción, tocá "Nuevo comunicado".' },
      { target: tab('Conversaciones'), pose: 'point', title: 'Conversaciones', text: 'Cuando te responden (o vos respondés un comunicado), la charla sigue acá. Es privada: solo la ven ustedes dos.' },
      { pose: 'cheer', title: '¡Listo!', text: 'En Aulas ves el horario, el calendario de evaluaciones y si falta algún docente. Activá las notificaciones para enterarte al instante.' },
    ],
  },
  {
    id: 'estudiante',
    title: 'Mi curso',
    description: 'Aulas, tu perfil con materias y notas, comunicados con tus docentes, canales y juegos.',
    keywords: ['estudiante', 'mi boletín', 'canales', 'juegos', 'aulas', 'mi perfil'],
    audience: (c) => student(c),
    steps: [
      { route: '/aulas', target: nav('/aulas'), pose: 'point', title: 'Aulas', text: 'El material y las tareas de cada materia. En "Horario" ves tus módulos y si falta algún profe; en "Calendario", las pruebas, los TP, los actos y los feriados.' },
      { route: '/mi-perfil', target: studentProfileNav, pose: 'point', title: 'Mi perfil', text: 'Tus materias con las notas publicadas, tu boletín, tu asistencia y tu historial de convivencia.' },
      { route: '/comunicados', target: newComm, pose: 'point', title: 'Escribirle a un profe', text: 'Con "Nuevo comunicado" le escribís a tus docentes o a preceptoría. Las respuestas te llegan en "Conversaciones".' },
      { target: nav('/canales'), pose: 'point', title: 'Canales', text: 'Hablá con tu curso. Los canales los modera el personal.' },
      { target: nav('/juegos'), pose: 'point', title: 'Juegos', text: 'Las preguntas y juegos que te asignan tus docentes.' },
      { pose: 'cheer', title: '¡A estudiar!', text: 'Tus notas aparecen cuando el colegio publica el boletín de cada período.' },
    ],
  },
  {
    id: 'mi-perfil',
    title: 'Mi perfil: materias y notas',
    description: 'Tus materias con sus docentes, las notas publicadas de cada período y tu convivencia.',
    keywords: ['mi perfil', 'mis notas', 'mis materias', 'mis docentes', 'convivencia', 'boletín'],
    audience: (c) => student(c),
    steps: [
      { route: '/mi-perfil', target: studentProfileNav, pose: 'point', title: 'Mi perfil', text: 'Todo lo tuyo en un lugar: materias, boletín, asistencia y convivencia.' },
      { target: tab('Materias'), clickOnNext: true, pose: 'point', title: 'Materias', text: 'Una tarjeta por materia, con quién la dicta y tus notas de cada período. Solo ves las que el colegio ya publicó.' },
      { target: { selector: 'button[aria-label^="Ver notas de"]' }, pose: 'point', title: 'Tocá una materia', text: 'Se abre el detalle: la nota de cada período, las observaciones de tus docentes y la nota final cuando esté.' },
      { target: tab('Convivencia'), pose: 'think', title: 'Convivencia', text: 'Lo que registró la escuela y cuándo: observaciones, sanciones y también reconocimientos.' },
      { target: tab('Datos'), pose: 'point', title: 'Mi email', text: 'En "Datos" está tu email: lo cambiás cuando quieras con "Cambiar email". Si la escuela te pide que lo actualices, te aparece un aviso arriba hasta que lo cambies.' },
      { pose: 'cheer', title: '¡Bien ahí!', text: 'Usá un email tuyo y real: es el que te sirve para recuperar la contraseña si te la olvidás.' },
    ],
  },
  {
    id: 'comunicado-familia',
    title: 'Escribirle a la escuela',
    description: 'Mandarle un comunicado a un docente, a preceptoría o a la conducción, y recibir la respuesta.',
    keywords: ['escribir a la docente', 'escribirle a la escuela', 'consulta', 'mensaje', 'hablar con la maestra', 'preceptoría', 'contactar'],
    audience: (c) => family(c) || student(c),
    steps: [
      { route: '/comunicados', target: newComm, pose: 'point', title: 'Nuevo comunicado', text: 'Desde Comunicados le escribís a la escuela. Tocá "Nuevo comunicado".' },
      { route: '/comunicados/nuevo', target: { selector: '[aria-label="¿Sobre quién?"]' }, pose: 'point', title: '¿Sobre quién?', text: 'Si sos familia, elegí de cuál de tus hijos/as se trata: según su curso te muestro a quién le podés escribir. Si sos estudiante, este paso no aparece.' },
      { target: { selector: 'section[aria-labelledby="to-h"]' }, pose: 'point', title: '¿A quién le escribís?', text: 'Docentes, preceptoría o conducción. Podés elegir a una persona o a varias.' },
      { target: { selector: 'label.check', text: 'Permitir respuestas' }, pose: 'point', title: 'Tipo y respuestas', text: 'Elegí el tipo (Consulta, Académico, Asistencia…), escribí el asunto y el mensaje. Con "Permitir respuestas" te pueden contestar.' },
      { pose: 'cheer', title: '¡Enviado!', text: 'Tocá "Enviar". Las respuestas te llegan en Comunicados → "Conversaciones".' },
    ],
  },

  // ---------- Para todos ----------
  {
    id: 'responder-comunicado',
    title: 'Responder un comunicado',
    description: 'Contestarle a quien lo envió, en privado, y seguir la charla en Conversaciones.',
    keywords: ['responder', 'responder comunicado', 'contestar', 'respuesta', 'conversaciones', 'mensajes'],
    audience: (c) => !!c.session,
    steps: [
      { route: '/comunicados', target: tab('Recibidos'), pose: 'point', title: 'Recibidos', text: 'Los comunicados que dicen "Admite respuestas" los podés contestar.' },
      { target: { selector: 'a.list-item', text: 'Admite respuestas' }, clickOnNext: true, pose: 'point', title: 'Abrí uno', text: 'Te abro uno que admite respuestas.' },
      { target: { selector: 'form', text: 'Responderle a' }, pose: 'point', title: 'Responder', text: 'Escribí abajo y tocá "Responder". Le llega solo a quien lo envió: nadie más del curso ni de la escuela lo ve.' },
      { route: '/comunicados?tab=conversaciones', target: tab('Conversaciones'), pose: 'point', title: 'Conversaciones', text: 'Cada respuesta abre una conversación privada que sigue acá. Desde el comunicado también llegás con "Ver conversación".' },
      { pose: 'cheer', title: '¡Así de simple!', text: 'Si el comunicado lo mandaste vos, en su detalle ves la sección "Respuestas": una conversación por cada persona que te contestó.' },
    ],
  },
  {
    id: 'calendario-aula',
    title: 'Calendario del aula',
    description: 'Evaluaciones, TP, tareas con fecha, actos y feriados de cada curso.',
    keywords: ['calendario del aula', 'calendario del curso', 'evaluaciones', 'pruebas', 'fechas de entrega', 'tp', 'feriados', 'actos'],
    audience: (c) => !!c.session,
    steps: [
      { route: '/aulas', target: nav('/aulas'), pose: 'point', title: 'Aulas', text: 'Cada curso tiene su aula.' },
      { target: { selector: 'a.card-link[href^="/aulas/"]' }, clickOnNext: true, pose: 'point', title: 'Elegí un curso', text: 'Te abro uno para mostrarte.' },
      { target: tab('Calendario'), clickOnNext: true, pose: 'point', title: 'Pestaña "Calendario"', text: 'Todo lo que tiene fecha en ese curso, mes por mes.' },
      { target: { selector: '.ccal-head' }, pose: 'point', title: 'El mes del curso', text: 'Evaluaciones, TP y tareas con fecha que publican los docentes, más los actos y los feriados. Con las flechas cambiás de mes y tocando un día o un evento ves el detalle.' },
      { pose: 'cheer', title: '¡Nada se te pasa!', text: 'Los feriados nacionales aparecen siempre, y cada fecha nueva que publica un docente se suma sola.' },
    ],
  },
];

/** Tutoriales que le corresponden a quien mira, en el orden sugerido. */
export const tutorialsFor = (c: HelpContext) => TUTORIALS.filter((t) => t.audience(c));
export const tutorialById = (id: string) => TUTORIALS.find((t) => t.id === id);
