/**
 * Últimos errores del navegador (excepciones de JS y pedidos a la API que fallaron). Se adjuntan
 * automáticamente a "Reportar un problema" para que soporte vea qué pasó sin pedirle nada al usuario.
 */
export interface ClientError { message: string; source?: string | null; at: string }

const MAX_ERRORS = 10;
const recent: ClientError[] = [];

export const recordClientError = (message: string, source?: string | null) => {
  recent.push({ message: message.slice(0, 500), source: source?.slice(0, 300) ?? null, at: new Date().toISOString() });
  if (recent.length > MAX_ERRORS) recent.shift();
};

export const recentClientErrors = () => [...recent];

/** Se llama una vez al arrancar la app. */
export const installClientErrorBuffer = () => {
  window.addEventListener('error', (event) => recordClientError(event.message || 'Error de JavaScript', event.filename ? `${event.filename}:${event.lineno}` : null));
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string } | string | undefined;
    recordClientError(typeof reason === 'string' ? reason : reason?.message ?? 'Promesa rechazada sin manejar', 'unhandledrejection');
  });
};
