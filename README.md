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
- **Rol de plataforma:** `SUPERADMIN` (equipo Sentryx). Da de alta colegios y ve la facturación de todos: `npm run superadmin -- --email ...`.
- **Roles de colegio:** una persona puede tener varios, en uno o varios colegios (ej: Docente en uno y Familia en otro).

| Categoría | Rol | Alcance | Puede |
|---|---|---|---|
| Directivo | Representante Legal | Toda la escuela | Todo, incluida la facturación |
| Directivo | Dirección / Rectoría | Su nivel (o toda la escuela) | Todo menos facturación; la estructura solo si su alcance es toda la escuela |
| Directivo | Vicedirección | Su nivel | Todo menos estructura y facturación |
| Directivo | Secretaría | Toda la escuela | Personas, comunicados, boletines, lectura de notas y asistencia |
| Directivo | Administración | Toda la escuela | Personas y comunicados |
| Directivo | Preceptoría | Su nivel o sus divisiones | Asistencia, alertas, comunicados, aulas, moderar canales |
| Docente | Docente | Sus divisiones/materias | Notas y material de SUS materias, comunicados a sus cursos, mensajes |
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
- **Sesiones:** al cambiar o blanquear una contraseña se cierran todas las sesiones de esa cuenta (`User.tokenVersion`). Una cuenta desactivada queda afuera aunque tenga un token vigente.
- **Límites de pedidos** (`middlewares/rateLimits.ts`), pensados para colegios que salen a internet con una sola IP:
  - con sesión: 300 pedidos/minuto **por usuario**;
  - login: 10 intentos **fallidos** por cuenta cada 15 minutos (y 100 por IP); los ingresos correctos no cuentan;
  - recupero de contraseña: 5 por hora; mensajes: 30 por minuto; subidas: 60 cada 10 minutos;
  - tope general de 3000 pedidos/minuto por IP contra abusos masivos.
- **Headers:** HSTS, CSP restrictiva (la API solo devuelve JSON), sin `x-powered-by`, sin referrer.
- `npm run audit:permissions` revisa todas las rutas antes de desplegar.

## Calificaciones por nivel (configurables)

- **Secundario**: 2 cuatrimestres × 2 bimestres. El 1º bimestre de cada cuatrimestre es **conceptual** y el 2º es **numérico**. La nota final es el promedio de los numéricos.
- **Primario**: 3 trimestres, escala conceptual (Sobresaliente → Insuficiente).
- **Inicial**: informes narrativos.

Las familias ven un período **solo cuando la escuela publica el boletín** de esa división.

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

- **Reportar un problema:** en el menú y en *Mi perfil*. Va asociado al usuario, con la pantalla y los últimos errores técnicos. Se ve el estado y la respuesta en *Mis reportes*.
- **Auditoría** (*Administración → Auditoría* y *Plataforma → Auditoría*): acción, usuario, IP, fecha y hora, cambios con antes/después e ingresos (también los fallidos).

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
