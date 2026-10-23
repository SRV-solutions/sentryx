# Sentryx

Plataforma escolar para colegios de nivel **Inicial, Primario y Secundario**: comunicados con confirmación de lectura, mensajería familia ↔ escuela, notas por nivel, boletines, asistencia y alertas. Es **multi-colegio**: cada institución tiene su propio espacio (sus niveles, personas y datos) dentro de la plataforma Sentryx, desarrollada por SRV.

- **API**: Node 20 + Express + Sequelize (PostgreSQL) + Socket.IO — `api/`
- **Web**: React 19 + Vite + TypeScript, PWA mobile-first, dark/light — `client/`

## Desarrollo local

```bash
# API
cd api
cp .env.example .env          # completar DB_* y JWT_SECRET; DB_SYNC=true en desarrollo
npm install
npm run seed:demo             # escuela demo con los 3 niveles (contraseña de todos: demo1234)
npm run dev                   # http://localhost:3000 (en desarrollo el chat corre dentro de la API)

# Web
cd client
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Usuarios demo: `representante@`, `directora@` (Primario), `rectora@` (Secundario), `preceptora@`, `secretaria@`, `administracion@`, `docente1..8@`, `familia1..30@`, `estudiante1..12@` (Secundario) y `superadmin@` (equipo Sentryx) — todos `@demo.sentryx`. Las familias también pueden ingresar con su DNI.

## Estructura del backend (`api/src`)

```
routes/        Solo declaran: ruta + middlewares + controlador. routes/index.ts tiene el mapa completo.
controllers/   La lógica de cada ruta (un archivo por recurso: students, staff, grades, threads…).
validators/    Esquemas zod de cada ruta (body, query, params).
services/      Lógica reutilizable: sesión escolar, permisos (rbac), accesos, facturación, archivos…
middlewares/   authenticate, authorize, schoolSession, nonStaffWriteGuard, rateLimits, security.
constants/     Enums y catálogos: permissions.ts (Entity, Action), roles.ts (RoleCode y roles por defecto), school.ts.
models/        Modelos Sequelize. Roles y permisos: Role, Permission, RolePermission, UserRole.
scripts/       migrate, seedDemo, bootstrap, superadmin, backup, auditPermissions.
```

Una ruta se lee así:

```ts
router.patch('/people/:id', authorize(Entity.USERS, Action.UPDATE), validate(PeopleValidator.updatePerson), PeopleController.updatePerson);
//            ruta           "como mínimo, permiso de editar usuarios"   valida el body con zod          la lógica
```

**Agregar una ruta nueva:**
1. Esquema en `validators/<recurso>.validator.ts`.
2. Función en `controllers/<recurso>.controller.ts` (envuelta en `asyncHandler`).
3. Línea en `routes/<recurso>.routes.ts` con su `authorize(Entity.X, Action.Y)`.
4. Si hace falta un permiso nuevo: agregarlo en `constants/permissions.ts` (catálogo) y en los roles que lo tengan por defecto en `constants/roles.ts`. Al arrancar, la API lo crea en la base.
5. `npm run audit:permissions`: falla si alguna ruta que escribe quedó sin permiso.

## Roles y permisos

**Un usuario tiene muchos roles y un rol tiene muchos permisos. Un permiso es una acción sobre una entidad.**

| Tabla | Qué guarda |
|---|---|
| `Permission` | `entity` + `action` (ej: `users` + `update`). Ver `constants/permissions.ts`. |
| `Role` | Código (`DOCENTE`, `PRECEPTOR`, `SUPERADMIN`…), nombre, alcance (plataforma o colegio), categoría y jerarquía. |
| `RolePermission` | Qué permisos tiene cada rol. |
| `UserRole` | Qué roles tiene cada usuario: en qué colegio (vacío = rol de plataforma) y con qué alcance (nivel o divisiones). |

- El catálogo de `constants/` es la configuración **por defecto**: al arrancar se crean los roles y permisos que falten. Si se ajusta un vínculo rol↔permiso directo en la base, se respeta (los permisos se recargan cada 5 minutos).
- **Rol de plataforma:** `SUPERADMIN` (equipo Sentryx). Da de alta colegios y ve la facturación de todos. Se suman desde la consola (*Plataforma → Equipo Sentryx*) o con `npm run superadmin -- --email ...`; **quitar** a un superadmin solo se puede por consola del servidor (`--remove`), nunca desde la web: nadie puede borrar a otro.
- **Roles de colegio:** una persona puede tener varios, en uno o varios colegios (ej: Docente en uno y Familia en otro). **Dentro del mismo colegio también** (Secretaría + Preceptoría, Dirección + Docente, superadmin + Docente): los permisos se suman y el alcance es la unión. Desde *Administración → Personal*, botón **Otro rol** en la persona.
- **Roles personalizados** (*Administración → Roles y permisos → Nuevo rol*): la conducción (RL, Dirección, Rectoría, Vicedirección; permiso `roles:manage`) arma un rol tildando acciones concretas del catálogo. Reglas: solo permisos que quien lo crea ya tiene, jerarquía siempre menor a la propia, y no se elimina mientras alguien lo tenga. Viven en `Role.schoolId` y se comportan como los del catálogo (`services/roleRegistry.ts`).

| Categoría | Rol | Alcance | Puede |
|---|---|---|---|
| Directivo | Representante Legal | Toda la escuela | Todo, incluida la facturación |
| Directivo | Dirección / Rectoría | Su nivel (o toda la escuela) | Todo menos facturación; la estructura solo si su alcance es toda la escuela |
| Directivo | Vicedirección | Su nivel | Todo menos estructura y facturación |
| Directivo | Coordinación pedagógica | Su nivel | Como Vicedirección, pero sin publicar boletines |
| Directivo | Secretaría | Toda la escuela | Personas, comunicados, lectura de notas y asistencia (no publica boletines) |
| Directivo | Administración | Toda la escuela | Personas y comunicados |
| Directivo | Jefatura de preceptores | Su nivel (todas las divisiones) | Lo mismo que Preceptoría, sin límite de divisiones |
| Directivo | Preceptoría | Su nivel o sus divisiones | Asistencia, alertas, comunicados, aulas, moderar canales |
| Docente | Docente | Sus divisiones/materias | Notas y material de SUS materias, asistencia de sus cursos, comunicados a sus cursos, mensajes |
| Familia | Familia | Solo sus hijos | Notas publicadas, asistencia, comunicados, mensajes con la escuela |
| Estudiante | Estudiante (Secundario) | Su curso | Boletín publicado, aulas, canales del curso, mensajes con sus docentes |

Reglas que se aplican en el backend:
- **Jerarquía:** solo se otorgan, editan o blanquean cuentas de menor rango que el propio. Nadie se da roles a sí mismo.
- **Familias y estudiantes** solo pueden escribir mensajes, confirmar lecturas y subir adjuntos propios (`middlewares/nonStaffWriteGuard.ts`).
- El **alcance** (qué divisiones, qué alumnos) lo controla cada controlador con la sesión escolar (`services/schoolSession.ts`).
- Todo cambio sensible queda en `AuditLog`. Nada se borra: las bajas son lógicas.

## Seguridad

- **Solo el front:** la API rechaza (403) todo pedido que no venga del front (header `Origin` dentro de `CORS_ORIGINS`) o de un cliente registrado (header `X-Client-Key` con una clave de `CLIENT_APP_KEYS`, para la futura app móvil o scripts de soporte). Quedan abiertos solo `/health` y las fotos de perfil.
- **Red:** en producción la API y el tiempo real escuchan en `127.0.0.1` (`HOST`); solo se llega por Caddy con HTTPS.
- **Sesiones por dispositivo** (`UserSession`): cada login crea una sesión y el token lleva su id. Duran **30 días desde el último uso**: mientras se usa, la API renueva el token sola (header `X-Session-Token`, que web y app guardan); 30 días sin tocarla y se cierra. En *Mi perfil → Sesiones y dispositivos* (y en la app, *Más → Seguridad*) se ven las sesiones abiertas y se cierran las de los otros dispositivos. Al cambiar o blanquear una contraseña se cierran todas (`User.tokenVersion`); una cuenta desactivada queda afuera aunque tenga un token vigente.
- **Llevar Sentryx al celular:** desde la PC, un QR con un link de un solo uso (5 minutos, guardado hasheado) que abre la app o el navegador del celular ya con la sesión, sin escribir la contraseña.
- **Límites de pedidos** (`middlewares/rateLimits.ts`), pensados para colegios que salen a internet con una sola IP:
  - con sesión: 300 pedidos/minuto **por usuario**;
  - login: 10 intentos **fallidos** por cuenta cada 15 minutos (y 100 por IP); los ingresos correctos no cuentan;
  - recupero de contraseña: 5 por hora; mensajes: 30 por minuto; subidas: 60 cada 10 minutos;
  - tope general de 3000 pedidos/minuto por IP contra abusos masivos.
- **Headers:** HSTS, CSP restrictiva (la API solo devuelve JSON), sin `x-powered-by`, sin referrer.
- `npm run audit:permissions` revisa todas las rutas antes de desplegar.

## Calificaciones por nivel (configurables)

Cada nivel tiene un **modo de calificación por defecto** (`Level.settings.gradingMode`) que define la conducción del nivel en *Administración → Calificaciones* (permiso `grading_periods:update`: RL, Dirección, Rectoría, Vicedirección, Coordinación; cada una solo sobre su nivel):

- **Solo números** (`NUMERIC`): todos los períodos con nota numérica; final = promedio.
- **Solo letras** (`CONCEPTUAL`): la escala de palabras del nivel (editable); sin promedio.
- **Informes** (`NARRATIVE`): texto por materia o por sala.
- **Mixto** (`MIXED`, el clásico de Secundario): bimestres impares conceptuales, pares numéricos, más la nota de cuatrimestre si se agrega.

Por defecto: Inicial informes, Primario letras, Secundario mixto. El modo se aplica a los períodos nuevos (esquema trimestral/bimestral) y, con *Aplicar el modo a los períodos del ciclo*, a los existentes que no tengan notas. Además **cada período se puede cambiar individualmente** (numérico / letras / informe) mientras no tenga notas cargadas; con notas, la API responde 400 para no dejar notas ilegibles. Escala, rango numérico, nota de aprobación y valor de las inasistencias también se editan ahí. La planilla y el boletín se adaptan solos al tipo de cada período (los informes van debajo de la tabla cuando conviven con notas).

**Nota de cuatrimestre (Secundario):** desde *Administración → Estructura → Nota de cuatrimestre* se agrega a cada cuatrimestre un período numérico de cierre ("Nota 1º Cuatrimestre") que carga la docente además de los bimestres; sus fechas abarcan el cuatrimestre entero (se superponen a propósito, no afecta nada). Con ellas, la **final anual = promedio de las dos notas de cuatrimestre**; sin ellas, el de las numéricas. La planilla sugiere el promedio de los bimestres entre paréntesis. Se pueden quitar mientras no tengan notas.

Las familias ven un período **solo cuando la escuela publica el boletín** de esa división. Publicar es decisión de la **conducción** (Representante Legal, Dirección, Rectoría, Vicedirección); Secretaría y Coordinación leen notas pero no publican.

**Boletines de años anteriores:** al pasar de grado, las notas quedan atadas al curso de ese año y no se tocan. En la ficha del alumno (web y app) hay un selector de ciclo y la **Trayectoria** (año → curso); `GET /school/grades/report-card/:id?yearId=` devuelve el boletín de ese ciclo, siempre con la misma regla de publicación.

## Alertas de asistencia

Las reglas se configuran desde *Alertas → Reglas*, sin tocar código:
- total de faltas,
- días consecutivos,
- porcentaje,
- faltas en los últimos N días.

Se evalúan solas al tomar o justificar asistencia y avisan a preceptoría y conducción, y a la familia si se configura.

## Colegios y niveles

- **Multi-colegio:** cada colegio tiene su nombre, escudo y datos (*Administración → Institución*) y su link de ingreso `/c/<slug>`. La marca de la plataforma (Sentryx) se mantiene.
- **Selector de nivel:** quien tiene acceso a más de un nivel (Representante Legal, Dirección general, Secretaría) elige Todos, Inicial, Primario o Secundario desde el encabezado. Toda la app se filtra a ese nivel.
- **Alta de un colegio nuevo:** desde la consola *Plataforma → Colegios* (superadmin) o con `npm run bootstrap` (ver DEPLOY.md).
- **Eliminar un colegio (definitivo):** en *Plataforma → Colegios*, primero se suspende y después *Eliminar*, escribiendo su identificador para confirmar. Se borran sus datos, sus archivos del bucket y las cuentas que no están en otro colegio; queda registrado en la auditoría de la plataforma. Antes conviene exportar su facturación.
- **Crear un superadmin:** `npm run superadmin -- --email equipo@... --first Nombre --last Apellido`.

## Ciclo lectivo, alumnos y personal

- **Estructura por defecto** (*Administración → Estructura*): en un colegio nuevo, crea de una vez las salas de 3, 4 y 5, los grados (6 o 7) y los años (5 o 6), con secciones, turno y materias habituales. No duplica lo que ya existe. Después cada curso se edita o elimina (si nunca tuvo alumnos) a mano.
- **Períodos de evaluación:** esquema **trimestral** o **bimestral** con fechas desde/hasta, aplicado a todos los niveles o a los elegidos. Si un nivel ya tiene notas, solo se actualizan nombres y fechas.
- **Personal por CSV** (*Administración → Personal → Importar CSV*): columnas `nombre;apellido;email;dni;telefono;rol;nivel;cargo`. Procesa fila por fila e informa los errores con su número de fila.
- **Credenciales:** al dar de alta a una persona (o blanquear su contraseña) se muestran una sola vez, con *Imprimir*, *Copiar*, *Descargar* y **Probar ingreso**, que abre el login en otra pestaña con usuario y contraseña ya cargados (van en el `#fragmento` de la URL: no llegan al servidor). Al entrar así se cierra la sesión propia en ese navegador.
- **Cambio de curso** (ficha del alumno o selección múltiple en *Alumnos*): dentro del mismo ciclo, sin perder notas ni asistencia.
- **Baja con motivo** (cambio de colegio, egreso, mudanza, abandono u otro), con fecha y observaciones. Se conserva todo el historial; la familia deja de verlo y su cuenta de estudiante se desactiva. Se puede **reincorporar**. Los dados de baja se ven con el filtro *Dados de baja*.
- **Promoción anual** (*Administración → Ciclo lectivo*):
  1. Se prepara el ciclo siguiente, copiando cursos y docentes.
  2. Se revisa el destino sugerido de cada alumno: promueve al año siguiente (Sala de 5 → 1º grado, último grado → 1º año), repite o egresa.
  3. Se aplica en un solo paso. El ciclo nuevo pasa a ser el actual y los egresados quedan dados de baja con motivo *Egreso*.

## Planes (por persona)

Cada persona del colegio tiene un plan. La Representante Legal los cambia desde *Planes*, de a una persona o varias juntas. Ahí también aprueba los pedidos de cambio que llegan desde *Mi perfil*.

| Plan | $/persona/mes | Espacio | Agrega |
|---|---|---|---|
| Básico | 660 | 5 GB | Comunicados, boletines, notas, asistencia y chats (lo de siempre) |
| Ampliado | 720 | 15 GB | Más espacio para archivos |
| Profesional | 2.150 | 30 GB | Recibos de sueldo con conformidad y legajo docente (cargos, horas, turnos y horario) |
| Integral | 3.000 | 50 GB | Calendario con feriados y actos, encargados de actos con su espacio, programas de materias y juegos de preguntas |

- **Dónde está definido:** el catálogo vive en `api/src/constants/plans.ts` (precios, espacio y funciones).
- **Cómo se protege cada función:** las rutas exigen el permiso del rol (`authorize`) **y** que el plan incluya la función (`requireFeature`).
- **Si el plan no alcanza:** la API responde 402 con el plan necesario, y la app muestra qué incluye y ofrece pedirlo.
- **Familias:** con planes superiores solo *ven* más cosas: el calendario, los programas de sus hijos y los resultados de los juegos.
- **Facturación:** se cobra el mes completo del plan **más alto** que la persona tuvo en el mes. El historial queda en `PlanAssignment`.
- **Juegos en vivo:**
  - Los alumnos entran desde `/jugar` con el PIN y un apodo, sin cuenta.
  - El estado se consulta cada segundo.
  - Tiene su propio límite de pedidos por jugador, porque toda el aula sale por la misma IP.

## Soporte y auditoría

- **Reportar un problema:** en el menú y en *Mi perfil*. Va asociado al usuario, con la pantalla y los últimos errores técnicos, y se pueden adjuntar hasta 5 **capturas o videos** (imágenes hasta 15 MB —se achican solas—, videos MP4/WebM/MOV hasta 200 MB), que suben directo al bucket `R2_REPORTS_BUCKET` y se ven en *Plataforma → Reportes* y en *Mis reportes*. Se ve el estado y la respuesta en *Mis reportes*.
- **Auditoría** (*Administración → Auditoría* y *Plataforma → Auditoría*): acción, usuario, IP, fecha y hora, cambios con antes/después e ingresos (también los fallidos).

## Aula: tareas, TP y evaluaciones

En el muro de cada curso, además de materiales y tareas, el docente (o la conducción) publica **trabajos prácticos** y **evaluaciones** con fecha. Aparecen en la **agenda del curso** y en el **inicio** de las familias y docentes ("Próximas evaluaciones y entregas", 14 días). Un docente solo puede publicar, cargar notas, asignar juegos y programas **en sus propias materias y cursos** (`TeachingAssignment`); en cualquier otro curso la API responde 403.

## Estadísticas por curso

*Estadísticas* (quien ve asistencia **y** notas: conducción, coordinación, preceptoría, secretaría): por cada curso del alcance, asistencia %, inasistencias, llegadas tarde, retiros, promedio y alertas; y el detalle con gráfico por mes, alumnos con más faltas y promedio por materia y período (en Primario, distribución de la escala conceptual; en Inicial no hay promedios). API: `GET /school/stats/overview?levelId=` y `GET /school/stats/division/:id`.

## Buscador y ayuda

Barra superior (o **Ctrl+K**): escribís cómo lo dirías ("notas", "faltas", "boletín", "pasar de grado") y aparece un desplegable con las pantallas que corresponden (solo las que esa persona puede usar) y, para el personal, alumnos y personas por nombre. La página *Ayuda* (`/ayuda`) es el índice completo por sección. El índice vive en `client/src/school/helpIndex.ts`.

## Comunicados

- **Estados:** *Borrador* (solo lo ve el autor), *Programado* (se envía solo a la fecha y hora elegidas; el servidor revisa cada minuto), *Enviado* y *Archivado* (sale de la bandeja de todos, sigue accesible con el filtro *Archivados*). Borradores y programados se editan, se envían ya o se eliminan; los enviados no se editan.
- **Búsqueda y filtros** (web y app): texto en título o cuerpo, *Sin leer*, *Pendientes de confirmar*, *Urgentes*, *Con adjuntos*, *Archivados* y rango de fechas. En *Enviados*, también por estado.
- **¿Para quién?** Divisiones, nivel, toda la escuela, solo personal, o **Familias (elegir)**: el listado completo de las familias del alcance del autor (madre/padre/tutor con sus hijos, curso y contacto), con búsqueda por familia o alumno y filtros por nivel, grado/año y división; se eligen una por una o con *Seleccionar las filtradas* (ej.: "todo 3º año"). A una familia elegida a mano se le envía aunque tenga marcado *no recibe comunicados*. **Administración** tiene este listado completo con los contactos; una docente solo ve las familias de sus cursos y sin contactos.
- Al abrir un comunicado queda como leído; los que piden confirmación muestran el botón "Confirmo que lo leí".

## Aulas

Cada curso o división es un **aula**, donde están sus docentes y alumnos:
- **Muro:** materiales y tareas por materia (archivos, fotos, videos y links de YouTube embebidos).
- **Comunicados:** los que recibió el curso, su nivel o toda la escuela.
- **Integrantes:** docentes y alumnos. Por privacidad, las familias solo ven a sus hijos.
- **Accesos directos del docente:** notas, asistencia y estado académico.

Las familias entran al aula de sus hijos para leer materiales y comunicados.

## Producción

Ver **[DEPLOY.md](DEPLOY.md)**: Netlify (frontend) + VPS Ubuntu sin Docker (API, tiempo real y PostgreSQL con systemd) + Cloudflare R2 (archivos), con costos mensuales y por usuario.

```bash
cd api && npm run build && npm run db:migrate && npm start
node dist/scripts/bootstrap.js --school "Colegio X" --slug colegio-x --admin-email ... --admin-first ... --admin-last ...
```
