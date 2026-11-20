export interface ExtensionSession {
  apiBaseUrl: string;
  pairingToken: string;
  extensionInstanceId: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  preparationId?: string;
  agencyName?: string;
  ttdAccountLabel?: string;
  bookingCategory?: string;
  pilgrimCount?: number;
  donationAmount?: number;
  validationStatus?: string;
  workflowStatus?: string;
  contentRevision?: number;
  operatorName?: string;
  lastSyncedAt?: string;
  selectedPilgrimIds: string[];
  allowOverwrite: boolean;
  connected: boolean;
}

const SESSION_KEY = 'dd_extension_session_v1';

export async function loadSession(): Promise<ExtensionSession | null> {
  const data = await chrome.storage.session.get(SESSION_KEY);
  return data[SESSION_KEY] ?? null;
}

export async function saveSession(session: ExtensionSession) {
  await chrome.storage.session.set({ [SESSION_KEY]: session });
}

export async function clearSession() {
  await chrome.storage.session.remove(SESSION_KEY);
}

export function createInstanceId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `ext-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function sessionAuth(session: ExtensionSession) {
  if (!session.accessToken) throw new Error('Missing extension access token — reconnect from DarshanDesk');
  return {
    pairingToken: session.pairingToken,
    extensionInstanceId: session.extensionInstanceId,
    accessToken: session.accessToken,
  };
}

export function accessTokenExpiringSoon(session: ExtensionSession, skewMs = 60_000): boolean {
  if (!session.accessTokenExpiresAt) return false;
  return new Date(session.accessTokenExpiresAt).getTime() - Date.now() < skewMs;
}