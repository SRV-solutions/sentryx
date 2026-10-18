import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ darkMode: false, toggleTheme: () => {} });

export const useTheme = () => useContext(ThemeContext);

const read = () => {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved === 'dark';
  } catch {
    /* almacenamiento no disponible */
  }
  // Sin preferencia guardada: sigue al sistema del celular/computadora.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

/** Tema SRV: aplica data-theme en <html> (variables CSS) y mantiene la API `darkMode` usada por las páginas existentes. */
export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(read);

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#000000' : '#f5f6f8');
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* noop */
    }
  }, [darkMode]);

  const toggleTheme = () => setDarkMode((prev) => !prev);

  return <ThemeContext.Provider value={{ darkMode, toggleTheme }}>{children}</ThemeContext.Provider>;
};
