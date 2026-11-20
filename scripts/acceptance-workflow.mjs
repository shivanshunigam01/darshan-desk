/**
 * Non-interactive acceptance checks against a running API (default :4000).
 * Does not capture screenshots; logs step outcomes for FULL_WORKFLOW_TEST_REPORT.md.
 */
const base = process.env.DD_API_BASE || 'http://127.0.0.1:4000';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const steps = [];

function record(step, status, detail) {
  steps.push({ step, status, detail });
  console.log(`[${status}] ${step} — ${detail}`);
}

try {
  const health = await req('/health');
  record('1-2 Services', health.status === 200 ? 'PASS' : 'FAIL', `GET /health ${health.status}`);

  const superLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'superadmin@darshandesk.local', password: 'SuperAdmin@2026!' },
  });
  const superToken = superLogin.data.token;
  record(
    '4 Super Admin login',
    superLogin.status === 200 && superLogin.data.operator?.role === 'super_admin' ? 'PASS' : 'FAIL',
    superLogin.status === 200 ? 'JWT issued' : JSON.stringify(superLogin.data)
  );

  const platform = await req('/api/platform/command-center/overview', { token: superToken });
  record('30 Super Admin analytics API', platform.status === 200 ? 'PASS' : 'FAIL', `overview ${platform.status}`);

  const adminLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@darshandesk.local', password: 'admin123' },
  });
  const adminToken = adminLogin.data.token;
  record('7 Agency admin login', adminLogin.status === 200 ? 'PASS' : 'FAIL', adminLogin.data.operator?.role || 'fail');

  const quota = await req('/api/ttd/quota/current', { token: adminToken });
  const provider =
    quota.data?.meta?.providerKind ?? quota.data?.providerKind ?? quota.data?.source ?? 'unknown';
  record('22 Quota available (default)', quota.status === 200 ? 'PASS' : 'FAIL', `provider=${provider}`);

  const quotaZero = await req('/api/ttd/quota/current?mockScenario=zero_quota', { token: adminToken });
  const qz = quotaZero.data?.quota ?? quotaZero.data;
  record(
    '23 Quota exhausted (mock)',
    quotaZero.status === 200 && (qz?.quotaCount === 0 || qz?.success === 0) ? 'PASS' : 'PARTIAL',
    `quotaCount=${qz?.quotaCount ?? qz?.success ?? 'n/a'}`
  );

  const pilgrims = await req('/api/catalog/pilgrims', { token: adminToken });
  record('10 Pilgrims list', pilgrims.status === 200 ? 'PASS' : 'FAIL', `count ${pilgrims.data?.pilgrims?.length ?? 0}`);

  const accounts = await req('/api/ttd-accounts', { token: adminToken });
  record('9 TTD account references', accounts.status === 200 ? 'PASS' : 'FAIL', `rows ${accounts.data?.accounts?.length ?? 0}`);

  const attempts = await req('/api/reliability/attempts', { token: adminToken });
  record('28 Booking history', attempts.status === 200 ? 'PASS' : 'FAIL', `attempts ${attempts.data?.attempts?.length ?? 0}`);

  const mockPage = await fetch(`${base}/mock-booking/?pilgrims=2`);
  record('18 Mock pilgrim form', mockPage.status === 200 ? 'PASS' : 'FAIL', `HTTP ${mockPage.status}`);
} catch (e) {
  record('acceptance script', 'FAIL', e.message);
  process.exitCode = 1;
}

console.log(JSON.stringify({ steps }, null, 2));