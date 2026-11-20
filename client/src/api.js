const API = '/api';

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || res.statusText);
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token) => request('/auth/me', { token }),
  activePolicy: (token) => request('/policy/active', { token }),
  ttdUiReference: (token) => request('/policy/ui-reference', { token }),
  ttdAccounts: (token) => request('/catalog/ttd-accounts', { token }),
  ttdAccountsManage: (token, query = '') => request(`/ttd-accounts${query ? `?${query}` : ''}`, { token }),
  ttdAccountCreate: (token, body) => request('/ttd-accounts', { method: 'POST', token, body }),
  ttdAccountUpdate: (token, id, body) => request(`/ttd-accounts/${id}`, { method: 'PATCH', token, body }),
  ttdAccountConsent: (token, id) =>
    request(`/ttd-accounts/${id}/consent`, { method: 'POST', token, body: { acknowledged: true } }),
  ttdAccountAssign: (token, id, operatorIds) =>
    request(`/ttd-accounts/${id}/assign-operators`, { method: 'POST', token, body: { operatorIds } }),
  ttdAccountVerify: (token, id, body) => request(`/ttd-accounts/${id}/verification`, { method: 'POST', token, body }),
  ttdAccountArchive: (token, id) => request(`/ttd-accounts/${id}/archive`, { method: 'POST', token }),
  ttdAccountDisable: (token, id) => request(`/ttd-accounts/${id}/disable`, { method: 'POST', token }),
  ttdAccountActivate: (token, id) => request(`/ttd-accounts/${id}/activate`, { method: 'POST', token }),
  ttdAccountOperators: (token) => request('/ttd-accounts/operators/list', { token }),
  pilgrims: (token) => request('/catalog/pilgrims', { token }),
  createPilgrim: (token, body) => request('/catalog/pilgrims', { method: 'POST', token, body }),
  updatePilgrim: (token, id, body) => request(`/catalog/pilgrims/${id}`, { method: 'PATCH', token, body }),
  deletePilgrim: (token, id) => request(`/catalog/pilgrims/${id}`, { method: 'DELETE', token }),
  adminLicense: (token) => request('/admin/license', { token }),
  adminActivateLicense: (token, body) => request('/admin/license/activate', { method: 'POST', token, body }),
  preparations: (token) => request('/preparations', { token }),
  preparation: (token, id) => request(`/preparations/${id}`, { token }),
  createPreparation: (token, body) => request('/preparations', { method: 'POST', token, body }),
  updatePreparation: (token, id, body) => request(`/preparations/${id}`, { method: 'PATCH', token, body }),
  consent: (token, id) =>
    request(`/preparations/${id}/consent`, { method: 'POST', token, body: { acknowledged: true } }),
  validate: (token, id) => request(`/preparations/${id}/validate`, { method: 'POST', token }),
  pairExtension: (token, id) => request(`/preparations/${id}/extension/pair`, { method: 'POST', token }),
  extensionStatus: (token, id) => request(`/preparations/${id}/extension/status`, { token }),
  extensionActivePreparation: (token) => request('/extension/active-preparation', { token }),
  awaitingOfficial: (token, id) => request(`/preparations/${id}/official-awaiting`, { method: 'POST', token }),
  recordOutcome: (token, id, body) => request(`/preparations/${id}/record-outcome`, { method: 'POST', token, body }),
  quotaDashboard: (token, query) => request(`/quota/dashboard?${query}`, { token }),
  quotaScenarios: (token) => request('/quota/scenarios', { token }),
  quotaManual: (token, body) => request('/quota/manual', { method: 'POST', token, body }),
  ttdQuotaCurrent: (token, query) => request(`/ttd/quota/current?${query}`, { token }),
  ttdIntegrationStatus: (token, query = '') => request(`/ttd/integration/status?${query}`, { token }),
  ttdMockScenarios: (token) => request('/ttd/mock-scenarios', { token }),
  ttdPersonLimit: (token, amount) => request(`/ttd/donation/person-limit?amount=${amount}`, { token }),
  qaDashboard: (token) => request('/reliability/dashboard', { token }),
  qaAttempts: (token, query = '') => request(`/reliability/attempts${query ? `?${query}` : ''}`, { token }),
  qaAgencyPerformance: (token, query = '') => request(`/reliability/reports/agency-performance${query ? `?${query}` : ''}`, { token }),
  qaOfficialReference: (token, id, body) =>
    request(`/reliability/attempts/${id}/official-reference`, { method: 'POST', token, body }),
  qaAttempt: (token, id) => request(`/reliability/attempts/${id}`, { token }),
  qaCreateAttempt: (token, preparationId) =>
    request('/reliability/attempts', { method: 'POST', token, body: { preparationId } }),
  qaTransition: (token, id, body) => request(`/reliability/attempts/${id}/transition`, { method: 'POST', token, body }),
  qaMockSignal: (token, body) => request('/reliability/mock-official-signal', { method: 'POST', token, body }),
  qaDiagnostic: (token, id) => request(`/reliability/attempts/${id}/diagnostic-export`, { token }),
  platformOverview: (token) => request('/platform/command-center/overview', { token }),
  platformAgencies: (token, query = '') => request(`/platform/command-center/agencies${query ? `?${query}` : ''}`, { token }),
  platformAccounts: (token, query = '') =>
    request(`/platform/command-center/account-references${query ? `?${query}` : ''}`, { token }),
  platformAnalytics: (token, query = '') => request(`/platform/command-center/analytics${query ? `?${query}` : ''}`, { token }),
  platformExportAgencies: (token, query = '') =>
    fetch(`${API}/platform/command-center/agencies/export.csv${query ? `?${query}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  platformExportAccounts: (token, query = '') =>
    fetch(`${API}/platform/command-center/account-references/export.csv${query ? `?${query}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
};