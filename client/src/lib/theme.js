const KEY = 'dd-theme';

export function getStoredTheme() {
  try {
    return localStorage.getItem(KEY) || 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}

export function initTheme() {
  applyTheme(getStoredTheme());
}