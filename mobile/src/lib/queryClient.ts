import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { ApiError } from './api';

/**
 * Caché de datos con persistencia: lo último que se vio queda guardado en el celular. Al abrir la app
 * sin señal (o antes de que termine de cargar) ya hay contenido en pantalla, y los pedidos repetidos
 * no gastan datos. Se limpia al cerrar sesión.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 3600_000,
      // Con la caché persistida, mostrar lo guardado y refrescar cuando vuelva la conexión.
      networkMode: 'offlineFirst',
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'sentryx.query-cache',
  throttleTime: 1500,
});

export const PERSIST_MAX_AGE = 7 * 24 * 3600_000;
