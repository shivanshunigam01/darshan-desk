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

export async function apiGet<T>(auth: OperatorAuth, path: string): Promise<T> {
  const base = auth.apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const body = await parseJson(res);
  if (!res.ok) throw new ApiError(body.error || 'Request failed', res.status);
  return body as T;
}