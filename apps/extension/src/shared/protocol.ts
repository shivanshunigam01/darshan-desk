/** DarshanDesk extension ↔ service worker message contract */
export type ProtocolMessage =
  | { type: 'EXTENSION_PAIR_REQUEST'; pairingToken: string; apiBaseUrl: string }
  | { type: 'EXTENSION_PAIR_SUCCESS' }
  | { type: 'PREPARATION_SELECTED'; pilgrimIds: string[] }
  | { type: 'PREPARATION_SYNC' }
  | { type: 'FORM_DETECTED' }
  | { type: 'FORM_FILL_REQUEST'; allowOverwrite: boolean; validateOnly?: boolean }
  | { type: 'FORM_VALIDATE_REQUEST'; allowOverwrite?: boolean }
  | { type: 'FORM_FILL_RESULT' }
  | { type: 'FORM_VALIDATION_RESULT' }
  | { type: 'SESSION_STATUS_CHANGED' }
  | { type: 'DISCONNECT' }
  | { type: 'OPEN_SUPPORTED_FORM' }
  | { type: 'OPEN_OFFICIAL_PORTAL' }
  | { type: 'GET_STATE' }
  | { type: 'PORTAL_CREDENTIALS_SYNC'; credentials: { loginId: string; password: string; label?: string; savedAt?: string } }
  | { type: 'GET_PORTAL_CREDENTIALS_STATE' }
  | { type: 'TTD_LOGIN_FILL_REQUEST' }
  | { type: 'TTD_LOGIN_FILL_FROM_PAGE' };

export type ProtocolResponse = {
  ok: boolean;
  error?: string;
  errorCode?: string;
  session?: unknown;
  payload?: unknown;
  sync?: unknown;
  fillReport?: unknown;
  validation?: unknown;
  formDetection?: unknown;
  event?: string;
};