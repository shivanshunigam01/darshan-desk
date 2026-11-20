import type { OperatorAuth } from './authStorage';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

export type RegisterPayload = {
  agencyName: string;
  displayName: string;
  email: string;
  password: string;
  consentAcknowledged: true;
  donationAmount?: number;
  bookingCategory?: 'CURRENT' | 'ADVANCE';
  ttdAccount?: { accountLabel: string; loginIdentifier: string };
  pilgrims?: Array<{
    fullName: string;
    age: number;
    gender: string;
    idType: string;
    idNumber: string;
    mobile?: string;
    city?: string;
  }>;
};

export async function register(apiBaseUrl: string, body: RegisterPayload) {
  const base = apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new ApiError(data.error || 'Registration failed', res.status);
  return data as {
    token: string;
    operator: OperatorAuth['operator'];
    onboarding?: {
      pairingToken?: string;
      validationStatus?: string;
      validationErrors?: string[];
      connectHint?: string;
    };
  };
}

export async function login(apiBaseUrl: string, email: string, password: string) {
  const base = apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await parseJson(res);
  if (!res.ok) throw new ApiError(body.error || 'Login failed', res.status);
  return body as {
    token: string;
    operator: OperatorAuth['operator'];
  };
}

export async function fetchMe(auth: OperatorAuth) {
  const base = auth.apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const body = await parseJson(res);
  if (!res.ok) throw new ApiError(body.error || 'Session expired', res.status);
  return body as { operator: OperatorAuth['operator']; license: OperatorAuth['license'] };
}

async function authFetch(auth: OperatorAuth, path: string, init: RequestInit = {}) {
  const base = auth.apiBaseUrl.replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new ApiError('Cannot reach API — start the server (npm run dev:api) and check Settings → API URL', 0);
  }
  const body = await parseJson(res);
  if (!res.ok) throw new ApiError(body.error || body.details?.[0]?.message || 'Request failed', res.status);
  return body;
}

export async function apiGet<T>(auth: OperatorAuth, path: string): Promise<T> {
  return authFetch(auth, path) as Promise<T>;
}

export async function apiPost<T>(auth: OperatorAuth, path: string, payload: unknown): Promise<T> {
  return authFetch(auth, path, { method: 'POST', body: JSON.stringify(payload) }) as Promise<T>;
}

export async function apiPatch<T>(auth: OperatorAuth, path: string, payload: unknown): Promise<T> {
  return authFetch(auth, path, { method: 'PATCH', body: JSON.stringify(payload) }) as Promise<T>;
}

export async function apiDelete<T>(auth: OperatorAuth, path: string): Promise<T> {
  return authFetch(auth, path, { method: 'DELETE' }) as Promise<T>;
}