# Despliegue productivo barato · Sentryx

Destino: colegios de **~400 alumnos, ~40 docentes y ~700 familias** (por ejemplo, un colegio con Inicial, Primario y Secundario). La arquitectura admite varios colegios sin cambios.

```
 Celulares / PCs
   │
   ├──► app.tudominio.com ──► Netlify (frontend estático)                  [gratis]
   │
   ├──► api.tudominio.com ──► VPS: API Node (sentryx-api)  ─┐              [~USD 5/mes, todo junto]
   │                               PostgreSQL               │ HTTP interno
   ├──► rt.tudominio.com  ──► VPS: Tiempo real (sentryx-realtime) ◄────┘  (chat y avisos al instante)
   │
   └──► Cloudflare R2 (archivos de docentes y backups, subida/descarga directa) [10 GB gratis]
```

> Precios orientativos (fuentes de terceros, octubre 2026): confirmalos en la página de cada proveedor.

## ¿Por qué el chat va en un servicio aparte?

- **Actualizar la API no corta los chats.** `deploy/update.sh` reinicia solo la API: las conexiones de los celulares siguen abiertas.
- **No se pierden mensajes.** Todo mensaje se guarda primero en la base vía API. El servidor de tiempo real solo lo entrega al instante. Si estuviera caído:
  - llega igual la notificación push;
  - el celular se pone al día solo al reconectar.
- **Escala aparte.** Empieza como otro proceso en el mismo VPS. Si algún día hace falta, se lleva a otro servidor cambiando `REALTIME_URL` en la API y `VITE_REALTIME_URL` en Netlify.
- **Rendimiento:** con este volumen, un proceso de tiempo real soporta miles de conexiones simultáneas con unos 100 MB de RAM. **Un segundo servidor no hace falta para empezar.**

## 1. Archivos: Cloudflare R2

1. En Cloudflare → **R2**, creá los buckets `sentryx-files` y `sentryx-backups`.
2. En **Manage R2 API Tokens**, creá un token *Object Read & Write* para esos buckets. En el `.env`, cargá:
   - `R2_ACCOUNT_ID`: el Account ID que aparece en el panel de R2;
   - `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY`: los del token.

   No hace falta nada de Amazon.
3. En `sentryx-files` → *Settings* → **CORS policy** (obligatorio: los navegadores suben directo al bucket):

   ```json
   [{ "AllowedOrigins": ["https://app.tudominio.com", "https://tu-sitio.netlify.app"],
      "AllowedMethods": ["GET", "PUT", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```

4. Probalo desde el servidor (o tu PC con el `.env` de producción):

   ```bash
   cd api && npm run build && npm run storage:setup
   ```

   Verifica las credenciales y que el bucket exista, **aplica la política CORS** con los orígenes de `CORS_ORIGINS` (así no hace falta el paso 3 a mano; `--no-cors` lo saltea) y sube, lee y borra un archivo de prueba. Si algo falla, dice qué revisar.

Mientras R2 no esté configurado, la app funciona igual: los botones de adjuntar se ocultan en mensajes y canales y, si alguien intenta subir algo, ve un mensaje claro en lugar de un error.

**Un solo bucket para todo:** `sentryx-files` guarda los archivos de cada colegio en `schools/<id>/`.

Los backups van aparte, en `sentryx-backups`.

**Gestión de los archivos de docentes:**
- **Registro y aula:** cada archivo queda registrado (quién lo subió, peso real verificado en el bucket, aula y materia).
- **Límites:** cuota por colegio, 25 MB por archivo (videos: 300 MB) y solo formatos de clase.
- **Fotos:** se comprimen en el celular antes de subirse.
- **Videos largos:** conviene subirlos a YouTube como "no listado" y pegar el link. Se ven embebidos sin ocupar espacio.
- **Pantalla "Archivos":**
  - el docente ve y borra lo suyo;
  - Administración ve el uso total, el ranking por docente y libera espacio.
- **Limpieza automática:** las subidas abandonadas se borran solas.

## 2. Backend en un VPS, sin Docker

Todo queda instalado directo en Ubuntu: Node 22, PostgreSQL, Caddy (HTTPS automático) y **systemd**, que reinicia los servicios si se caen y los levanta al prender el servidor.

1. Creá en Hetzner un **CX23** (2 vCPU, 4 GB) con **Ubuntu 24.04**.
2. En el DNS de tu dominio, creá dos registros `A` hacia la IP del servidor: `api.tudominio.com` y `rt.tudominio.com`.
3. Entrá por SSH como root y corré:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/<usuario>/sentryx/main/deploy/setup-server.sh -o setup.sh
   bash setup.sh https://github.com/<usuario>/sentryx.git api.tudominio.com rt.tudominio.com
   ```

   Instala todo y crea la base con una contraseña aleatoria. También genera `JWT_SECRET` y `REALTIME_SECRET` y deja corriendo:
   - `sentryx-api`: la API, en `127.0.0.1:3000`; corre las migraciones al arrancar;
   - `sentryx-realtime`: el chat, en `127.0.0.1:3001`;
   - `sentryx-backup.timer`: el backup diario a las 03:30 en R2, que conserva los últimos 30;
   - Caddy, con los certificados HTTPS;
   - el firewall (22/80/443) y las actualizaciones de seguridad automáticas.
4. Completá `/opt/sentryx/api/.env`:
   - R2,
   - email,
   - claves push,
   - dominios del frontend.

   Después corré `systemctl restart sentryx-api sentryx-realtime`.
5. Creá tu cuenta de superadmin (equipo Sentryx) y, desde la app, *Plataforma → Colegios → Nuevo colegio*:

   ```bash
   cd /opt/sentryx/api
   sudo -u sentryx npm run superadmin -- --email equipo@tudominio.com --first Nombre --last Apellido
   ```

   O por consola, el colegio y su Representante Legal (la contraseña temporal se muestra una sola vez):

   ```bash
   cd /opt/sentryx/api
   sudo -u sentryx npm run bootstrap -- --school "Colegio Divina Providencia" --slug divina-providencia \
     --levels INICIAL,PRIMARIO,SECUNDARIO --year 2027 \
     --admin-email rl@divinaprovidencia.edu.ar --admin-first Nombre --admin-last Apellido
   ```

**Operación diaria:**

| Tarea | Comando |
|---|---|
| Actualizar (sin cortar chats) | `bash /opt/sentryx/deploy/update.sh` |
| Actualizar también el tiempo real | `bash /opt/sentryx/deploy/update.sh --realtime` |
| Logs de la API / del chat | `journalctl -u sentryx-api -f` / `journalctl -u sentryx-realtime -f` |
| Estado | `systemctl status sentryx-api sentryx-realtime` |
| Backup manual | `cd /opt/sentryx/api && sudo -u sentryx npm run db:backup` |
| Conexiones de chat activas | `curl -s https://rt.tudominio.com/health` |

**Si preferís no administrar Linux: Railway.**
- Creá dos servicios desde la carpeta `api/` del repo:
  - **api**: build `npm ci && npm run build`, start `npm run db:migrate && npm start`, `REALTIME_MODE=remote`;
  - **realtime**: mismo build, start `npm run start:realtime`.
- Sumá un PostgreSQL (`DATABASE_URL`) y la red privada entre ambos para `REALTIME_URL`.
- Costo aproximado: USD 20–40 por mes.

## 3. Frontend: Netlify

1. Netlify → *Import from Git* → este repo. El `netlify.toml` ya define la carpeta `client`, el build y las rutas.
2. En *Environment variables*, cargá:
   - `VITE_API_URL=https://api.tudominio.com`
   - `VITE_REALTIME_URL=https://rt.tudominio.com`
3. Configurá el dominio `app.tudominio.com`.
4. **Link para cada colegio:** `https://app.tudominio.com/c/<slug>`. Muestra el escudo y el nombre del colegio al ingresar.

⚠️ El plan gratuito de Netlify usa **300 créditos por mes**. Cada deploy consume unos 15 y cada GB transferido 10–20. **Si se agotan, el sitio se pausa** hasta el mes siguiente.
- La app está optimizada: caché de 1 año, service worker y unos 110 KB en la primera visita. Para 700 familias se estiman 2–4 GB por mes, así que entra en el plan.
- Igual, hacé deploys agrupados desde una rama `production` (no en cada commit).
- Si se acerca al límite, pasá a un plan pago o a **Cloudflare Pages**, que no tiene límite de ancho de banda en el plan gratis. Ya está preparado con `client/public/_redirects`.

## 4. Push y email

- **Push:** `cd api && npm run push:keys` en tu PC; pegá las claves en el `.env`. En iPhone, la familia tiene que agregar Sentryx a la pantalla de inicio.
- **Email:** solo se manda a quien no tiene push activo, o en comunicados urgentes o que piden confirmación (además de altas y recupero de contraseña). Así el volumen es bajo.

### Remitente `sentryx@wearesrv.com`

Estado del dominio `wearesrv.com` (revisado el 18/10/2026):

| Registro | Valor actual | Estado |
|---|---|---|
| MX | `mx1/mx2.hostinger.com` **y** `smtp.google.com` | ⚠️ Mezcla dos proveedores: dejá solo los de Hostinger (o solo Google) para que el correo entrante no se pierda |
| SPF | `v=spf1 include:_spf.mail.hostinger.com ~all` | ✅ Autoriza a Hostinger |
| DKIM | `hostingermail-a._domainkey` | ✅ Firmado por Hostinger |
| DMARC | `v=DMARC1; p=none` | ⚠️ Solo monitorea: cuando los envíos estén estables, pasalo a `p=quarantine` |

**Opción A: Hostinger (recomendada para empezar, costo 0).** El dominio ya está listo para Hostinger:
1. En hPanel → *Emails*, creá la casilla `sentryx@wearesrv.com`.
2. En el `.env`: `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_USER=sentryx@wearesrv.com`, `SMTP_PASS=<clave de la casilla>`, `MAIL_FROM=sentryx@wearesrv.com`.
3. Probalo: `npm run mail:test -- --to tu@email.com --check-dns`. Verifica la conexión, manda un email de prueba y revisa SPF, DKIM y DMARC.

El límite de Hostinger depende del plan (en general, cientos de envíos por día). Alcanza para varios colegios por el bajo volumen.

**Opción B: proveedor transaccional (cuando crezca).** Mejor entregabilidad, métricas de rebotes y sin límites de casilla:
- **Resend**: 3.000 por mes gratis (100 por día). Se verifica el dominio con un registro DKIM (`resend._domainkey`) y un SPF en un subdominio de envío (`send.wearesrv.com`), así **no toca** el SPF de Hostinger. SMTP: `smtp.resend.com:465`, usuario `resend` y la API key como contraseña.
- **Amazon SES**: unos USD 0,10 cada 1.000 emails. Hay que pedir salir del *sandbox*. SMTP: `email-smtp.<región>.amazonaws.com:587`.
- **SendGrid**: ya no tiene plan gratis permanente. No conviene para este volumen.

En cualquier caso, el remitente sigue siendo `sentryx@wearesrv.com`: solo cambian las 4 variables `SMTP_*`.

## 5. Costos mensuales y costo por usuario

**Supuestos:**
- 400 alumnos (sin cuenta propia), unas 700 familias y 50 de personal: **~750 cuentas activas**.
- Unos 6 GB de materiales por año.

| Concepto | VPS único (recomendado) | VPS + VPS aparte para el chat | Railway |
|---|---|---|---|
| Frontend (Netlify) | USD 0 | USD 0 | USD 0 |
| API + PostgreSQL | ~USD 5 (CX23) | ~USD 5 | ~USD 15–30 |
| Tiempo real (chat) | incluido | ~USD 4 (otro CX23) | ~USD 5–10 |
| Archivos + backups (R2, < 10 GB el primer año) | USD 0 | USD 0 | USD 0 |
| Email (Brevo) / dominio | ~USD 1 | ~USD 1 | ~USD 1 |
| **Total mensual** | **≈ USD 6–7** | **≈ USD 10–11** | **≈ USD 21–41** |
| **Por alumno / mes** | **≈ USD 0,016** | ≈ USD 0,026 | ≈ USD 0,05–0,10 |
| **Por cuenta activa / mes** | **≈ USD 0,009** | ≈ USD 0,014 | ≈ USD 0,03–0,05 |
| Por alumno / año | ≈ USD 0,20 | ≈ USD 0,32 | ≈ USD 0,63–1,23 |

**Cómo escala:**
- **Almacenamiento:** después de los 10 GB gratis, cada GB extra cuesta USD 0,015 por mes (50 GB son unos USD 0,60).
- **Más colegios en el mismo VPS:** el CX23 aguanta unos 5–8 colegios de este tamaño. Con 5 colegios, el costo baja a unos USD 0,004 por alumno por mes.
- **Al crecer:** primero el chat a su propio VPS (cambiando una URL); después la base de datos a un servidor aparte o administrado.
- **Variables a vigilar:** el ancho de banda de Netlify y los videos subidos en lugar de enlazados.

**Ingresos por plan:** se cobra por persona según su plan ($660 Básico, $720 Ampliado, $2.150 Profesional y $3.000 Integral; ver README → Planes). La infraestructura es la misma para todos los planes. El espacio extra (15 GB Ampliado, 30 GB Profesional, 50 GB Integral) es el único costo que crece, y solo si se usa: R2 cobra USD 0,015 por GB al mes, así que una persona que llena 50 GB cuesta unos USD 0,75 por mes.

**Conclusión:** la infraestructura cuesta centavos de dólar por alumno por año. El costo real del servicio está en soporte, capacitación y desarrollo.

## 6. Colegio de demostración (para directivos)

Crea un colegio de demo completo (Inicial, Primario y Secundario, con alumnos, notas, asistencia, comunicados y mensajes) con **un usuario por rol**:

```bash
cd api && npm run build
npm run seed:demo:prod -- --password 'Una-Clave-Larga-2026' --domain demo.wearesrv.com --name "Colegio Demo Sentryx" --slug demo
```

- `--password` es obligatoria en producción (mínimo 10 caracteres) y es la misma para todos los usuarios de la demo.
- En producción no se cargan DNIs ficticios (podrían coincidir con personas reales): se ingresa con el email.
- `--with-superadmin` crea además `superadmin@<dominio>` para mostrar la consola de la plataforma (no lo uses si no hace falta).
- Todos quedan en el **plan Básico**. Con `--show-plans`, el equipo directivo, docente1 y dos familias pasan a Integral para mostrar todas las funciones.
- Se cargan comunicados (con lecturas y confirmaciones), conversaciones familia–escuela y actividad en un canal de Secundario. Para agregar ese contenido a un colegio demo ya creado: `npm run demo:content:prod -- --slug demo --domain demo.wearesrv.com`.
- Manual para presentar a la conducción: `docs/Manual Sentryx - Colegio Demo.pdf` (los usuarios de ejemplo de la familia y el estudiante son `familia25` y `estudiante7`).
- Link de ingreso: `https://<tu-front>/c/demo`.

| Rol | Usuario | Qué muestra |
|---|---|---|
| Representante Legal | `representante@demo.wearesrv.com` | Todo el colegio, incluida la facturación |
| Dirección · Primario | `directora@demo.wearesrv.com` | Conducción de Primario |
| Vicedirección · Primario | `vicedirectora@demo.wearesrv.com` | Acompaña a la conducción |
| Rectoría · Secundario | `rectora@demo.wearesrv.com` | Conducción de Secundario |
| Secretaría | `secretaria@demo.wearesrv.com` | Altas, legajos y comunicados |
| Administración | `administracion@demo.wearesrv.com` | Familias y comunicados (no ve notas) |
| Preceptoría · Secundario | `preceptora@demo.wearesrv.com` | Asistencia, alertas y canales |
| Docente | `docente1@demo.wearesrv.com` | Sus materias: notas, aulas y mensajes |
| Familia (Inicial) | `familia1@demo.wearesrv.com` | Un hijo/a en Sala de 5 |
| Familia (Secundario) | `familia19@demo.wearesrv.com` | Un hijo/a en 2º 1ª |
| Estudiante (Secundario) | `estudiante1@demo.wearesrv.com` | Canales, aulas y mensajes con docentes |

Cuando termine la presentación, se puede suspender desde *Plataforma → Colegios* (no factura mientras está suspendido).

## 7. Soporte y auditoría

- **Reportar un problema:** cualquier usuario lo hace desde el menú (o *Mi perfil*). El reporte llega con su usuario, colegio, pantalla, IP, navegador y los últimos errores técnicos de su sesión. Se responde desde *Plataforma → Reportes de usuarios*, y quien reportó recibe la respuesta como notificación.
- **Auditoría:**
  - Cada acción que modifica algo queda registrada con usuario, IP, fecha y hora, resultado y duración.
  - También quedan los cambios sensibles (con el antes y el después) y los ingresos, incluidos los fallidos.
  - Cada colegio lo ve en *Administración → Auditoría* (Representante Legal y Dirección); el equipo Sentryx, en *Plataforma → Auditoría*.
  - La IP real se toma de `X-Forwarded-For`, que agrega Caddy (`app.set('trust proxy', 1)` en `api/src/app.ts`). Si además ponés el proxy naranja de Cloudflare delante, subilo a `2`: si no, se registra la IP de Cloudflare.

