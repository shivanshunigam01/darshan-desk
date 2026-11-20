/** TTD portal credentials — this browser only; never sent to DarshanDesk API. */
const KEY = 'darshandesk.ttdPortal.v1';

export function loadTtdPortalCredentials() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.loginId?.trim()) return null;
    return {
      loginId: String(parsed.loginId).trim(),
      password: parsed.password ? String(parsed.password) : '',
      label: parsed.label ? String(parsed.label) : 'My TTD login',
      savedAt: parsed.savedAt || null,
    };
  } catch {
    return null;
  }
}

export function saveTtdPortalCredentials({ loginId, password, label }) {
  const payload = {
    loginId: String(loginId).trim(),
    password: password ? String(password) : '',
    label: (label || 'My TTD login').trim() || 'My TTD login',
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
}

export function clearTtdPortalCredentials() {
  localStorage.removeItem(KEY);
}