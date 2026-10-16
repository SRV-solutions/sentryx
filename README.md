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
npm run dev                   # http://localhost:3000

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

## Producción

```bash
cd api && npm run build && npm run db:migrate && npm start
cd client && npm run build    # servir client/dist como sitio estático (con fallback a index.html)
```

- `npm run db:migrate` es idempotente: crea tablas, columnas e índices faltantes. **Nunca borra datos.** `DB_SYNC` está prohibido en producción.
- Notificaciones push: `npm run push:keys` y cargar `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`.
- S3: los navegadores suben archivos directo al bucket. El bucket necesita CORS que permita `PUT` desde el dominio del frontend.
- Email: Gmail permite unos 500 envíos por día. Para comunicados masivos usar Amazon SES (las credenciales SMTP se configuran en `.env`).

## Infraestructura recomendada (≈400 alumnos, 40 docentes, ~700 familias)

| Opción | Componentes | USD/mes aprox. |
|---|---|---|
| **VPS (recomendada)** | Hetzner CPX21 / DigitalOcean 4 GB: API + Postgres + Caddy (HTTPS) en Docker · web en Cloudflare Pages (gratis) · archivos en S3 · backup diario cifrado de Postgres a S3 | **15–25** |
| Administrada | Railway o Render (API + Postgres administrados) | 40–60 |
| AWS | Lightsail 2 GB + base administrada de Lightsail + S3 | 35–50 |

Extras en todas las opciones:
- SES: menos de USD 1 cada 10.000 emails.
- Web Push: gratis.
- OpenAI (Solvix): según uso, con `gpt-4o-mini` normalmente USD 5–20.

Carga esperada: el pico más fuerte es un comunicado a todas las familias (unos 700 destinatarios). El API lo resuelve con 1 INSERT masivo, y el envío de push y emails corre en segundo plano. Con 2 vCPU y 4 GB queda margen holgado.

Para la futura app React Native, la API ya está lista:
- autenticación JWT,
- header `X-School-Id`,
- tokens `EXPO` en `/school/push/subscribe`,
- tipos compartibles en `client/src/school/types.ts`.
