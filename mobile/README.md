# Sentryx móvil (Expo)

App para familias, docentes y preceptoría: comunicados, mensajes, boletín y asistencia del hijo/a, y **pase de lista desde el celular** (funciona sin señal: se guarda y se envía solo). La administración del colegio sigue en la web; la app abre esas pantallas en el navegador.

Hecha para celulares modestos: solo componentes nativos de React Native (sin librerías de UI), listas virtualizadas, caché de datos en el teléfono (abre al instante aunque no haya señal), tiempo real solo con la app en primer plano, y notificaciones push para el resto.

## Probar con Expo Go

1. Instalá **Expo Go** en el celular (App Store / Play Store).
2. En `api/.env` del backend poné una clave en `CLIENT_APP_KEYS` (mínimo 24 caracteres):
   `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
3. Copiá `.env.example` a `.env` y completá:
   - `EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_REALTIME_URL`: la **IP de tu PC en la wifi** (`ipconfig` → IPv4), por ejemplo `http://192.168.0.222:3000`. El celular no llega a `localhost`.
   - `EXPO_PUBLIC_CLIENT_KEY`: la misma clave que pusiste en `CLIENT_APP_KEYS`.
4. Levantá la API (`cd api && npm run dev`) y la app:

   ```bash
   cd mobile
   npm install
   npx expo start
   ```

5. Escaneá el QR con la cámara (iPhone) o desde Expo Go (Android). Celular y PC tienen que estar en la misma red; si no conecta, probá `npx expo start --tunnel`.

Usuarios del colegio demo: `docente1@demo.sentryx`, `familia1@demo.sentryx`, `preceptora@demo.sentryx` (contraseña `demo1234`, ver `api/src/scripts/seedDemo.ts`).

Para apuntar la app a producción, dejá las URLs de `app.json → extra` (Railway y Netlify) y solo completá la clave.

## Qué hace cada pantalla

| Pestaña | Quién la ve | Qué hace |
|---|---|---|
| Inicio | Todos | Resumen: sin leer, confirmaciones pendientes, asistencia del día (docentes), hijos (familias). |
| Asistencia | Quien tiene `attendance:update` (docentes, preceptoría) | Cursos del día, tocar al alumno para cambiar Presente → Ausente → Tarde → Retiro, justificar, guardar. Sin señal queda en el celular y se envía al volver la conexión. Al guardar pasa sola al próximo curso. |
| Mi hijo/a | Familias y estudiantes | Boletín (solo períodos publicados) y asistencia del año. |
| Comunicados | Todos | Bandeja con confirmación de lectura y adjuntos. |
| Mensajes | Todos | Conversaciones familia ↔ escuela en tiempo real; nuevo mensaje eligiendo alumno y destinatario. |
| Más | Todos | Perfil y contraseña, cambio de colegio, notificaciones, tema claro/oscuro, accesos a la web, salir. |

## Notificaciones push

- El token de Expo se registra en la API (`POST /school/push/subscribe`, `kind: EXPO`) y la API avisa por el servicio de Expo (`api/src/services/push.ts`). No necesita claves VAPID.
- **Expo Go en Android no recibe push remotas** (desde el SDK 53). En iPhone con Expo Go sí. Para Android hace falta una build propia (`eas build --profile development` o la app de las tiendas).
- Para que `getExpoPushTokenAsync` funcione hace falta el `projectId` de EAS: `npx eas init` lo agrega en `app.json → extra.eas.projectId`. Sin él, la app sigue funcionando sin push (el toggle queda "No disponible").

## Publicar en las tiendas

```bash
npm install -g eas-cli
eas login
eas init                 # agrega extra.eas.projectId
eas build --platform all # iOS necesita cuenta de Apple Developer; Android, Google Play Console
eas submit
```

Antes de publicar: en `app.json` ya están el `scheme` (`sentryx://`), los links de `https://sentryx.wearesrv.com` (abren en la app) y los IDs `com.wearesrv.sentryx`. Reemplazá los íconos de `assets/` por los de SRV.

## Estructura

```text
App.tsx                 proveedores (tema, React Query persistido, sesión, colegio), navegación, push
src/config.ts           URLs y clave (EXPO_PUBLIC_* o app.json → extra)
src/lib/api.ts          fetch con timeout, headers X-Client-Key / X-School-Id, errores de red
src/lib/queryClient.ts  caché en AsyncStorage (7 días), modo offlineFirst
src/lib/offlineAttendance.ts  cola de asistencia sin conexión + reintento al volver la red
src/lib/push.ts         registro del token Expo
src/lib/realtime.ts     socket.io solo en primer plano
src/context/            AuthContext (token en SecureStore), SchoolContext (colegio activo, permisos)
src/navigation/         stack + pestañas, deep links
src/screens/            pantallas
src/ui/                 componentes base (botón, tarjeta, chip, toast…)
```

Chequeos: `npx tsc --noEmit` y `npx expo export --platform android` (bundle sin errores).
