/**
 * API-level wizard flow (matches BookingPreparePage steps 1–6).
 * Requires API on DD_API_BASE (default :4000) and seeded admin.
 */
const base = process.env.DD_API_BASE || 'http://127.0.0.1:4000';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const steps = [];
const log = (step, ok, detail) => {
  steps.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}: ${detail}`);
};

try {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@darshandesk.local', password: 'admin123' },
  });
  if (login.status !== 200) throw new Error(`login ${login.status}`);
  const token = login.data.token;
  log('1 login', true, login.data.operator?.email);

  const [policyRes, accRes, pilRes] = await Promise.all([
    req('/api/policy/active', { token }),
    req('/api/catalog/ttd-accounts', { token }),
    req('/api/catalog/pilgrims', { token }),
  ]);
  let accountId = accRes.data.accounts?.[0]?._id;
  if (!accountId) {
    const manage = await req('/api/ttd-accounts', { token });
    accountId = manage.data.accounts?.[0]?._id;
  }
  const pilgrimIds = (pilRes.data.pilgrims || []).slice(0, 1).map((p) => p._id);
  if (!accountId) throw new Error('no TTD account for wizard');
  if (!pilgrimIds.length) throw new Error('no pilgrims for wizard');
  log('2 catalog', true, `account=${accountId} pilgrims=${pilgrimIds.length}`);

  const create = await req('/api/preparations', {
    method: 'POST',
    token,
    body: {
      ttdAccountReferenceId: accountId,
      bookingCategory: 'CURRENT',
      trustCategory: 'SRIVANI',
      donationAmount: policyRes.data.policy?.minimumDonation || 10000,
      pilgrimIds,
    },
  });
  if (create.status !== 201) throw new Error(`create prep ${create.status} ${JSON.stringify(create.data)}`);
  const prepId = create.data.preparation._id;
  log('3 create draft', true, prepId);

  const consent = await req(`/api/preparations/${prepId}/consent`, { method: 'POST', token, body: { acknowledged: true } });
  if (consent.status !== 200) throw new Error(`consent ${consent.status}`);
  const validate = await req(`/api/preparations/${prepId}/validate`, { method: 'POST', token });
  if (validate.status !== 200) throw new Error(`validate ${validate.status}`);
  const status = validate.data.preparation?.validationStatus;
  log('4–5 validate', status === 'passed', status);

  const pair = await req(`/api/preparations/${prepId}/extension/pair`, { method: 'POST', token });
  if (pair.status !== 200) throw new Error(`pair ${pair.status}`);
  log('6 extension pair', Boolean(pair.data.pairingToken), `rev ${validate.data.preparation?.contentRevision}`);

  const patch = await req(`/api/preparations/${prepId}`, {
    method: 'PATCH',
    token,
    body: { donationAmount: (policyRes.data.policy?.minimumDonation || 10000) + 1000 },
  });
  const bumped = patch.data.preparation?.contentRevision;
  log('7 revision bump', patch.status === 200 && bumped > 1, `revision=${bumped}`);

  const extStatus = await req(`/api/preparations/${prepId}/extension/status`, { token });
  log('8 extension status', extStatus.status === 200, extStatus.data?.status || 'ok');

  const failed = steps.some((s) => !s.ok);
  if (failed) process.exitCode = 1;
} catch (e) {
  log('wizard e2e', false, e.message);
  process.exitCode = 1;
}

console.log(JSON.stringify({ steps }, null, 2));