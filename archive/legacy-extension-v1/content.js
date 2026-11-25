/**
 * Permitted assist only — does not click submit, accept declarations, or handle payment.
 */
chrome.storage.local.get(['pairingToken'], async ({ pairingToken }) => {
  if (!pairingToken) return;
  try {
    await fetch('http://localhost:4000/api/preparations/extension/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingToken }),
    });
  } catch {
    // extension may be offline from API; assist UI is future hook point
  }
});

console.info('[DarshanDesk] Extension loaded — operator must complete official TTD steps manually.');