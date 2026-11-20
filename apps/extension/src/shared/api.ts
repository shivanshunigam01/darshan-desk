import type { FillProfileData } from '@darshan-desk/fill-engine';

export type ExtensionAuthHeaders = {
  pairingToken: string;
  extensionInstanceId: string;
  accessToken: string;
};

function authHeaders(headers: ExtensionAuthHeaders) {
  return {
    'x-pairing-token': headers.pairingToken,
    'x-extension-instance-id': headers.extensionInstanceId,
    'x-extension-access-token': headers.accessToken,
  };
}

export async function apiConnect(
  apiBaseUrl: string,
  body: { pairingToken: string; extensionInstanceId: string; extensionVersion: string }
) {
  const res = await fetch(`${apiBaseUrl}/api/preparations/extension/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw enrichError(data, res.status);
  return data as {
    accessToken: string;
    accessTokenExpiresAt: string;
    preparationId: string;
    agencyName: string;
    operatorName?: string;
    ttdAccountLabel: string;
    validationStatus?: string;
    contentRevision?: number;
    workflowStatus?: string;
    bookingCategory: string;
    pilgrimCount: number;
    donationAmount: number;
  };
}

export async function apiSessionSync(apiBaseUrl: string, headers: ExtensionAuthHeaders) {
  const res = await fetch(`${apiBaseUrl}/api/preparations/extension/session-sync`, { headers: authHeaders(headers) });
  const data = await res.json();
  if (!res.ok) throw enrichError(data, res.status);
  return data;
}

export async function apiRefreshAccess(apiBaseUrl: string, headers: ExtensionAuthHeaders) {
  const res = await fetch(`${apiBaseUrl}/api/preparations/extension/refresh-access`, {
    method: 'POST',
    headers: { ...authHeaders(headers), 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw enrichError(data, res.status);
  return data as { accessToken: string; accessTokenExpiresAt: string };
}

export async function apiDisconnect(apiBaseUrl: string, headers: ExtensionAuthHeaders) {
  const res = await fetch(`${apiBaseUrl}/api/preparations/extension/disconnect`, {
    method: 'POST',
    headers: { ...authHeaders(headers), 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw enrichError(data, res.status);
  return data;
}

export async function apiHeartbeat(apiBaseUrl: string, headers: ExtensionAuthHeaders) {
  const res = await fetch(`${apiBaseUrl}/api/preparations/extension/heartbeat`, {
    method: 'POST',
    headers: { ...authHeaders(headers), 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw enrichError(data, res.status);
  return data;
}

export async function apiFillPayload(
  apiBaseUrl: string,
  headers: ExtensionAuthHeaders,
  pilgrimIds: string[]
): Promise<FillProfileData & { selectedPilgrimIds: string[]; fieldAudit?: { ok: boolean; errors: string[] } }> {
  const q = pilgrimIds.length ? `?pilgrimIds=${encodeURIComponent(pilgrimIds.join(','))}` : '';
  const res = await fetch(`${apiBaseUrl}/api/preparations/extension/fill-payload${q}`, {
    headers: authHeaders(headers),
  });
  const data = await res.json();
  if (!res.ok) throw enrichError(data, res.status);
  return data;
}

export async function apiFillReport(apiBaseUrl: string, headers: ExtensionAuthHeaders, report: unknown) {
  const res = await fetch(`${apiBaseUrl}/api/preparations/extension/fill-report`, {
    method: 'POST',
    headers: { ...authHeaders(headers), 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
  const data = await res.json();
  if (!res.ok) throw enrichError(data, res.status);
  return data;
}

function enrichError(data: { error?: string; code?: string; message?: string }, status: number) {
  const err = new Error(data.error || data.message || `HTTP ${status}`);
  (err as Error & { code?: string; status?: number }).code = data.code;
  (err as Error & { status?: number }).status = status;
  return err;
}