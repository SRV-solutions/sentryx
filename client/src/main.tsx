import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import { SchoolProvider } from './school/SchoolContext';
import { ToastProvider } from './ui';
import { ApiError } from './lib/api';
import { installClientErrorBuffer } from './lib/clientErrors';
import { ErrorBoundary } from './app/ErrorBoundary';
import './styles/app.css';

installClientErrorBuffer();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Datos "frescos" 30 s: navegar entre pantallas no repite pedidos (menos datos móviles).
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <SocketProvider>
              <SchoolProvider>
                <ToastProvider>
                  <ErrorBoundary>
                    <App />
                  </ErrorBoundary>
                </ToastProvider>
              </SchoolProvider>
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// PWA: instalable en el celular, push y apertura rápida (shell cacheado).
// Solo en producción: en desarrollo un service worker viejo puede servir versiones anteriores.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
