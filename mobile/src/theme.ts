import { createContext, useContext } from 'react';

/** Colores de marca de SRV (los mismos de la web) en modo claro y oscuro. */
export const palettes = {
  light: {
    bg: '#F3F5F8',
    surface: '#FFFFFF',
    surface2: '#EEF1F5',
    border: '#DDE2E8',
    text: '#111111',
    text2: '#3C4652',
    text3: '#6B7684',
    primary: '#0B78FB',
    onPrimary: '#FFFFFF',
    accent: '#F6950A',
    onAccent: '#000000',
    ok: '#1F8A4C',
    okBg: '#E3F5EA',
    warn: '#B26A00',
    warnBg: '#FFF4E2',
    danger: '#D5303E',
    dangerBg: '#FDE8EA',
    infoBg: '#EAF3FF',
    bubbleOther: '#E9EDF2',
  },
  dark: {
    bg: '#000000',
    surface: '#0D0D0D',
    surface2: '#1A1A1A',
    border: '#262626',
    text: '#F2F2F2',
    text2: '#C8C8C8',
    text3: '#8E8E8E',
    primary: '#2F8BFF',
    onPrimary: '#FFFFFF',
    accent: '#F6950A',
    onAccent: '#000000',
    ok: '#4CC27C',
    okBg: '#0F2A1A',
    warn: '#F2B04E',
    warnBg: '#2A1E08',
    danger: '#FF5A68',
    dangerBg: '#2A1013',
    infoBg: '#0E1F36',
    bubbleOther: '#1F1F1F',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['light']]: string };
export type ThemeMode = 'system' | 'light' | 'dark';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;

export interface Theme {
  colors: Palette;
  dark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<Theme>({ colors: palettes.light, dark: false, mode: 'system', setMode: () => {} });
export const useTheme = () => useContext(ThemeContext);

/** Colores de los estados de asistencia (iguales en los dos modos: tienen que reconocerse de un vistazo). */
export const ATTENDANCE_COLORS = {
  PRESENTE: { bg: '#1F8A4C', fg: '#FFFFFF' },
  AUSENTE: { bg: '#D5303E', fg: '#FFFFFF' },
  TARDE: { bg: '#F6950A', fg: '#000000' },
  RETIRO: { bg: '#0B78FB', fg: '#FFFFFF' },
} as const;
