/** Pull TTD portal credentials from DarshanDesk dashboard localStorage into extension storage. */
const DASHBOARD_KEY = 'darshandesk.ttdPortal.v1';

function readDashboardCredentials(): { loginId: string; password: string; label?: string; savedAt?: string } | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.loginId?.trim()) return null;
    return {
      loginId: String(parsed.loginId).trim(),
      password: parsed.password ? String(parsed.password) : '',
      label: parsed.label ? String(parsed.label) : undefined,
      savedAt: parsed.savedAt ? String(parsed.savedAt) : undefined,
    };
  } catch {
    return null;
  }
}

function syncToExtension() {
  const creds = readDashboardCredentials();
  if (!creds) return;
  chrome.runtime.sendMessage({ type: 'PORTAL_CREDENTIALS_SYNC', credentials: creds }).catch(() => {});
}

void syncToExtension();
window.addEventListener('darshandesk-portal-credentials-saved', syncToExtension);
window.addEventListener('storage', (e) => {
  if (e.key === DASHBOARD_KEY) syncToExtension();
});