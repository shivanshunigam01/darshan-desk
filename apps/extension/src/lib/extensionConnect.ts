import { apiGet, apiPost } from '../services/darshanDeskApi';
import type { OperatorAuth } from '../services/authStorage';
import type { ProtocolMessage, ProtocolResponse } from '../shared/protocol';
import { savePendingPairing } from '../services/authStorage';

function send<T extends ProtocolMessage>(msg: T): Promise<ProtocolResponse> {
  return chrome.runtime.sendMessage(msg);
}

/** Connect fill session using operator JWT — no manual pairing token UI. */
export async function autoConnectExtensionSession(auth: OperatorAuth): Promise<ProtocolResponse> {
  const active = await apiGet<{
    active: null | { preparationId: string; validationStatus?: string };
  }>(auth, '/api/extension/active-preparation');

  if (!active?.active?.preparationId) {
    throw new Error('No validated preparation — complete Preparation first');
  }

  const pair = await apiPost<{ pairingToken: string }>(
    auth,
    `/api/preparations/${active.active.preparationId}/extension/pair`,
    {}
  );
  await savePendingPairing(pair.pairingToken);
  const base = auth.apiBaseUrl.replace(/\/$/, '');
  return send({
    type: 'EXTENSION_PAIR_REQUEST',
    pairingToken: pair.pairingToken,
    apiBaseUrl: base,
  });
}