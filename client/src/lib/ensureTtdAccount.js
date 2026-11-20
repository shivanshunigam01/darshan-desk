import { api } from '../api.js';

/**
 * Ensure a booking-ready TTD account reference exists for this login id (server stores id only).
 */
export async function ensureTtdAccountForPortalLogin(token, loginId, label = 'My TTD login') {
  const id = String(loginId).trim();
  if (!id) throw new Error('TTD login id is required');

  const listed = await api.ttdAccountsManage(token, `q=${encodeURIComponent(id)}`);
  const rows = listed.accounts || [];
  let match =
    rows.find((a) => a.loginIdentifier === id) ||
    rows.find((a) => a.accountLabel === label) ||
    rows[0];

  if (!match) {
    const cr = await api.ttdAccountCreate(token, { accountLabel: label, loginIdentifier: id });
    match = cr.account || cr;
  }

  const accountId = match._id || match.id;
  if (!accountId) throw new Error('Could not link TTD account reference');

  if (match.authorizationStatus !== 'authorized' && match.isAuthorized !== true) {
    await api.ttdAccountConsent(token, accountId);
  }

  return accountId;
}