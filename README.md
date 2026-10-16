# Sentryx · por SRV

Plataforma escolar para colegios de nivel **Inicial, Primario y Secundario**: comunicados con confirmación de lectura, mensajería familia ↔ escuela, notas por nivel, boletines, asistencia y alertas. Incluye además los cursos de SRV (LMS, Solvix IA y comunidad).

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

Usuarios demo: `representante@`, `directora@` (Primario), `rectora@` (Secundario), `preceptora@`, `secretaria@`, `administracion@`, `docente1..8@`, `familia1..30@` — todos `@demo.sentryx`. Las familias también pueden ingresar con su DNI.

## Roles y seguridad

Cada usuario tiene **membresías por escuela** (rol + alcance). Los permisos están en código (`api/src/school/rbac.ts`) y el alcance se resuelve en cada request (`api/src/school/context.ts`):

| Rol | Alcance | Puede |
|---|---|---|
| Representante Legal | Toda la escuela | Todo |
| Dirección / Rectoría | Su nivel (o toda la escuela) | Todo; la estructura solo si su alcance es toda la escuela |
| Vicedirección | Su nivel | Todo menos la estructura |
| Secretaría | Toda la escuela | Personas, comunicados, boletines, lectura de notas y asistencia |
| Administración | Toda la escuela | Personas y comunicados |
| Preceptoría | Su nivel o sus divisiones | Asistencia, alertas, comunicados a sus divisiones |
| Docente | Sus divisiones/materias | Notas de sus materias, comunicados a sus cursos, mensajes |
| Familia | Solo sus hijos | Ver notas publicadas, asistencia, comunicados, escribir a docentes y conducción del nivel |

Todo cambio sensible (notas, asistencia, roles, publicaciones) queda en `AuditLog`.

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

- **Multi-colegio:** cada colegio tiene su nombre, escudo y datos (*Administración → Institución*) y su link de ingreso `/c/<slug>`. La marca Sentryx · SRV se mantiene.
- **Selector de nivel:** quien tiene acceso a más de un nivel (Representante Legal, Dirección general, Secretaría) elige Todos, Inicial, Primario o Secundario desde el encabezado. Toda la app se filtra a ese nivel.
- **Alta de un colegio nuevo:** `npm run bootstrap` (ver DEPLOY.md).

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
