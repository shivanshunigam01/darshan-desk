/** Same key shape as client `ttdPortalStorage.js` (synced from dashboard localStorage). */
export interface PortalCredentials {
  loginId: string;
  password: string;
  label?: string;
  savedAt?: string;
}

const STORAGE_KEY = 'dd_ttd_portal_credentials_v1';

export async function loadPortalCredentials(): Promise<PortalCredentials | null> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const raw = data[STORAGE_KEY] as PortalCredentials | undefined;
  if (!raw?.loginId?.trim()) return null;
  return {
    loginId: String(raw.loginId).trim(),
    password: raw.password ? String(raw.password) : '',
    label: raw.label,
    savedAt: raw.savedAt,
  };
}

export async function savePortalCredentials(creds: PortalCredentials) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      loginId: creds.loginId.trim(),
      password: creds.password || '',
      label: creds.label || 'My TTD login',
      savedAt: creds.savedAt || new Date().toISOString(),
    },
  });
}

export async function hasPortalCredentials(): Promise<boolean> {
  const c = await loadPortalCredentials();
  return Boolean(c?.loginId);
}

export function isTtdLoginUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/tirupatibalaji\.ap\.gov\.in|ttdevasthanams\.ap\.gov\.in/i.test(u.hostname)) return false;
    return /login|signin|sign-in/i.test(u.hash + u.pathname + u.search);
  } catch {
    return false;
  }
}