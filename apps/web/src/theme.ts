import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export type ThemeChoice = Theme | 'system';

type MediaSource = {
  readonly matches: boolean;
  addEventListener: (type: 'change', listener: () => void) => void;
  removeEventListener: (type: 'change', listener: () => void) => void;
};

const STORAGE_KEY = 'standcast.theme';
export const PREFERS_DARK = '(prefers-color-scheme: dark)';

let current: Theme = 'light';
const listeners = new Set<() => void>();

export function initialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  current = theme;
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme);
  for (const listener of listeners) listener();
}

export function chooseTheme(theme: Theme): void {
  choice = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
}

function systemPrefersDark(): boolean {
  try {
    return globalThis.matchMedia?.(PREFERS_DARK).matches ?? false;
  } catch {
    return false;
  }
}

export function followSystemTheme(): void {
  choice = 'system';
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  applyTheme(systemPrefersDark() ? 'dark' : 'light');
}

export function watchSystemTheme(media: MediaSource): () => void {
  const onChange = () => {
    if (getThemeChoice() === 'system') applyTheme(media.matches ? 'dark' : 'light');
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getTheme(): Theme {
  return current;
}

export function themeChoiceFrom(stored: string | null): ThemeChoice {
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

let choice: ThemeChoice = themeChoiceFrom(readStoredTheme());

export function getThemeChoice(): ThemeChoice {
  return choice;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, getThemeChoice, () => 'system');
}
