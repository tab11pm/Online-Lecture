import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'online-lecture.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function getThemeMode(): ThemeMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value;
    }
  } catch {
    // Storage may be unavailable; fall back to the light default.
  }
  return 'light';
}

function resolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system' && typeof window.matchMedia === 'function') {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  }
  return mode === 'system' ? 'light' : mode;
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(mode);
  root.dataset.themeMode = mode;
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Persisting the preference is best-effort.
  }
  applyTheme(mode);
}

export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);

  useEffect(() => {
    applyTheme(mode);
    if (mode !== 'system' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (): void => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mode]);

  function choose(next: ThemeMode): void {
    setThemeMode(next);
    setMode(next);
  }

  return [mode, choose];
}
