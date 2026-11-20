const API = 'http://localhost:4000';

document.getElementById('save').addEventListener('click', async () => {
  const pairingToken = document.getElementById('token').value.trim();
  const status = document.getElementById('status');
  if (!pairingToken) {
    status.textContent = 'Enter a pairing token.';
    return;
  }
  try {
    const res = await fetch(`${API}/api/preparations/extension/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Connection failed');
    await chrome.storage.local.set({ pairingToken, preparationId: data.preparationId });
    status.textContent = 'Connected. Open the official TTD booking page.';
  } catch (e) {
    status.textContent = e.message;
  }
});