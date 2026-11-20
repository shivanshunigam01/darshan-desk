const AUTH_KEY = 'dd_operator_auth_v1';
const SETTINGS_KEY = 'dd_extension_settings_v1';
const PENDING_PAIR_KEY = 'dd_pending_pair_v1';

export type OperatorAuth = {
  apiBaseUrl: string;
  token: string;
  operator: {
    id: string;
    email: string;
    displayName?: string;
    agencyId: string;
    role: string;
  };
  license?: { status?: string; message?: string };
  savedAt: string;
};

export type ExtensionSettings = {
  language: 'en' | 'hi' | 'te';
  apiBaseUrl: string;
  defaultTimezone: string;
};

const defaultSettings: ExtensionSettings = {
  language: 'en',
  apiBaseUrl: 'http://localhost:4000',
  defaultTimezone: 'Asia/Kolkata',
};

export async function loadAuth(): Promise<OperatorAuth | null> {
  const data = await chrome.storage.local.get(AUTH_KEY);
  return data[AUTH_KEY] ?? null;
}

export async function saveAuth(auth: OperatorAuth) {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

export async function clearAuth() {
  await chrome.storage.local.remove(AUTH_KEY);
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...defaultSettings, ...(data[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined) };
}

export async function saveSettings(patch: Partial<ExtensionSettings>) {
  const current = await loadSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...patch } });
}

export async function savePendingPairing(pairingToken: string) {
  await chrome.storage.local.set({ [PENDING_PAIR_KEY]: { pairingToken, savedAt: new Date().toISOString() } });
}

export async function loadPendingPairing(): Promise<string | null> {
  const data = await chrome.storage.local.get(PENDING_PAIR_KEY);
  return data[PENDING_PAIR_KEY]?.pairingToken ?? null;
}

export async function clearPendingPairing() {
  await chrome.storage.local.remove(PENDING_PAIR_KEY);
}