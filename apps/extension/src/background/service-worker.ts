import { auditPreparedPayload } from '@darshan-desk/fill-engine';
import type { ProtocolMessage, ProtocolResponse } from '../shared/protocol';
import {
  apiConnect,
  apiDisconnect,
  apiFillPayload,
  apiFillReport,
  apiHeartbeat,
  apiRefreshAccess,
  apiSessionSync,
} from '../shared/api';
import {
  accessTokenExpiringSoon,
  clearSession,
  createInstanceId,
  loadSession,
  saveSession,
  sessionAuth,
  type ExtensionSession,
} from '../shared/storage';
import {
  hasPortalCredentials,
  loadPortalCredentials,
  savePortalCredentials,
} from '../shared/portalCredentials';
import { loadSettings } from '../services/authStorage';

const EXT_VERSION = chrome.runtime.getManifest().version;
let cachedPayload: Awaited<ReturnType<typeof apiFillPayload>> | null = null;
let cachedPayloadRevision: number | undefined;
let latestPageMonitor: Record<string, unknown> | null = null;
let lastContinueReady = false;
let extensionActionInFlight: 'fill' | 'assist' | null = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'PAGE_MONITOR_UPDATE' && message.snapshot) {
    latestPageMonitor = message.snapshot as Record<string, unknown>;
    void notifyContinueReadyIfNeeded(latestPageMonitor);
  }
});

type MonitorContinue = { readyToContinue?: boolean; statusLabel?: string };

async function notifyContinueReadyIfNeeded(snapshot: Record<string, unknown>) {
  const cont = snapshot.continue as MonitorContinue | undefined;
  const ready = Boolean(cont?.readyToContinue);
  if (ready && !lastContinueReady) {
    const settings = await loadSettings();
    if (settings.notifyOnContinueReady && chrome.notifications) {
      chrome.notifications.create('dd-continue-ready', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('src/assets/logo.jpg'),
        title: 'DarshanDesk',
        message: cont?.statusLabel || 'Ready to Continue — click Continue yourself on TTD.',
      });
    }
  }
  lastContinueReady = ready;
}

function assertPageAssistAllowed() {
  const cont = latestPageMonitor?.continue as { blockExtensionAssist?: boolean; statusLabel?: string } | undefined;
  if (cont?.blockExtensionAssist) {
    throw Object.assign(
      new Error(cont.statusLabel || 'Official page is loading — wait before running extension assist.'),
      { code: 'PAGE_LOADING' }
    );
  }
}

function assertNoDuplicateExtensionAction(kind: 'fill' | 'assist') {
  if (extensionActionInFlight) {
    throw Object.assign(
      new Error(`Extension ${extensionActionInFlight} already in progress — duplicate action blocked.`),
      { code: 'DUPLICATE_ACTION' }
    );
  }
  const snap = latestPageMonitor as {
    blockAutoResubmit?: boolean;
    outcomeCode?: string;
    blockSuccessPromotion?: boolean;
  } | null;
  if (kind === 'assist' && snap?.blockAutoResubmit && snap.outcomeCode && snap.outcomeCode !== 'PAYMENT_PENDING') {
    throw Object.assign(
      new Error(
        `Official outcome ${snap.outcomeCode} — extension will not run payment assist or retry automatically.`
      ),
      { code: snap.outcomeCode }
    );
  }
  if (kind === 'assist' && snap?.outcomeCode === 'QUOTA_REJECTED') {
    throw Object.assign(
      new Error('Quota rejected on official page — operator must resolve on TTD without extension automation.'),
      { code: 'QUOTA_REJECTED' }
    );
  }
}

async function withExtensionActionLock<T>(kind: 'fill' | 'assist', fn: () => Promise<T>): Promise<T> {
  assertNoDuplicateExtensionAction(kind);
  extensionActionInFlight = kind;
  try {
    return await fn();
  } finally {
    extensionActionInFlight = null;
  }
}

chrome.runtime.onMessage.addListener((message: ProtocolMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error: Error & { code?: string }) =>
      sendResponse({ ok: false, error: mapErrorMessage(error), errorCode: error.code })
    );
  return true;
});

function mapErrorMessage(err: Error & { code?: string }): string {
  const code = err.code;
  if (code === 'EXT_ACCESS_EXPIRED') return 'Extension access expired — reconnect from DarshanDesk';
  if (code === 'EXT_ACCESS_REVOKED') return 'Extension access revoked — generate a new pairing token';
  if (code === 'PAIRING_EXPIRED') return 'Pairing token expired';
  if (code === 'INCORRECT_GROUP') return 'Incorrect pilgrim group for this preparation';
  if (err.message?.includes('401')) return 'Session unauthorized — check DarshanDesk login and extension pairing';
  return err.message || 'Request failed';
}

async function handleMessage(message: ProtocolMessage): Promise<ProtocolResponse> {
  switch (message.type) {
    case 'GET_STATE':
      return { ok: true, session: await loadSession(), payload: cachedPayload };
    case 'EXTENSION_PAIR_REQUEST':
      return pairExtension(message.pairingToken, message.apiBaseUrl);
    case 'PREPARATION_SYNC':
      return syncPreparation();
    case 'PREPARATION_SELECTED':
      return selectPilgrims(message.pilgrimIds);
    case 'OPEN_SUPPORTED_FORM':
      return openSupportedForm();
    case 'OPEN_OFFICIAL_PORTAL':
      return openOfficialPortal();
    case 'FORM_FILL_REQUEST':
      return fillActiveTab(message.allowOverwrite, message.validateOnly);
    case 'FORM_VALIDATE_REQUEST':
      return fillActiveTab(false, true);
    case 'DISCONNECT':
      return disconnect();
    case 'PORTAL_CREDENTIALS_SYNC':
      await savePortalCredentials(message.credentials);
      return { ok: true, event: 'SESSION_STATUS_CHANGED' };
    case 'GET_PORTAL_CREDENTIALS_STATE':
      return { ok: true, hasCredentials: await hasPortalCredentials() };
    case 'TTD_LOGIN_FILL_REQUEST':
    case 'TTD_LOGIN_FILL_FROM_PAGE':
      return fillTtdLoginOnActiveTab();
    case 'FILL_PAGE_OVERLAY':
      return relayFillPageOverlay(message.show, message.status, message.title);
    case 'SRIVANI_BOOKING_ASSIST_REQUEST':
      return srivaniBookingAssistActiveTab(message);
    case 'GET_PAGE_MONITOR':
      return getPageMonitorSnapshot();
    default:
      return { ok: false, error: 'Unknown message', errorCode: 'UNSUPPORTED' };
  }
}

async function getPageMonitorSnapshot(): Promise<ProtocolResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      const live = (await chrome.tabs.sendMessage(tab.id, { type: 'PAGE_MONITOR_REQUEST' })) as {
        snapshot?: Record<string, unknown>;
      };
      if (live?.snapshot) {
        latestPageMonitor = live.snapshot;
        return { ok: true, snapshot: live.snapshot };
      }
    } catch {
      /* tab may not host monitor script */
    }
  }
  return {
    ok: true,
    snapshot: latestPageMonitor ?? {
      supported: false,
      source: 'none',
      observedAtUtc: new Date().toISOString(),
      quota: {},
      continue: {},
      payment: {},
    },
  };
}

async function srivaniBookingAssistActiveTab(message: Extract<ProtocolMessage, { type: 'SRIVANI_BOOKING_ASSIST_REQUEST' }>): Promise<ProtocolResponse> {
  return withExtensionActionLock('assist', async () => {
  assertPageAssistAllowed();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  let response: Record<string, unknown>;
  try {
    response = (await chrome.tabs.sendMessage(tab.id, {
      type: 'SRIVANI_BOOKING_ASSIST_REQUEST',
      autoContinue: message.autoContinue,
      autoPaymentGateway: message.autoPaymentGateway,
      preferredGateway: message.preferredGateway,
    })) as Record<string, unknown>;
  } catch {
    throw new Error('Open TTD SRIVANI pilgrim or payment page — content script not loaded');
  }
  const success = Boolean(response?.success);
  return { ok: success, fillReport: response, validation: { ok: success } };
  });
}

async function relayFillPageOverlay(show: boolean, status?: string, title?: string): Promise<ProtocolResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: true };
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'FILL_PAGE_OVERLAY', show, status, title });
  } catch {
    /* tab may not be a supported TTD page */
  }
  return { ok: true };
}

async function fillTtdLoginOnActiveTab(): Promise<ProtocolResponse> {
  const creds = await loadPortalCredentials();
  if (!creds?.loginId) {
    throw new Error('Save TTD login in DarshanDesk first (TTD Login), then open this page again.');
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('No active tab');
  let host: URL;
  try {
    host = new URL(tab.url);
  } catch {
    throw new Error('Invalid tab URL');
  }
  if (!/tirupatibalaji\.ap\.gov\.in|ttdevasthanams\.ap\.gov\.in/i.test(host.hostname)) {
    throw new Error('Open the official TTD login page first (tirupatibalaji.ap.gov.in).');
  }

  let response: Record<string, unknown>;
  try {
    response = await chrome.tabs.sendMessage(tab.id, {
      type: 'TTD_LOGIN_FILL',
      credentials: creds,
    });
  } catch {
    throw new Error('Login helper not loaded — refresh the TTD page after reinstalling the extension.');
  }

  const ok = Boolean(response?.ok);
  return {
    ok,
    fillReport: response,
    error: ok ? undefined : String(response?.error || response?.message || 'Login fill failed'),
  };
}

async function pairExtension(pairingToken: string, apiBaseUrl: string): Promise<ProtocolResponse> {
  const existing = await loadSession();
  const extensionInstanceId = existing?.extensionInstanceId || createInstanceId();
  const session: ExtensionSession = {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    pairingToken: pairingToken.trim(),
    extensionInstanceId,
    selectedPilgrimIds: [],
    allowOverwrite: false,
    connected: false,
  };

  const result = await apiConnect(session.apiBaseUrl, {
    pairingToken: session.pairingToken,
    extensionInstanceId: session.extensionInstanceId,
    extensionVersion: EXT_VERSION,
  });

  session.connected = true;
  session.preparationId = result.preparationId;
  session.accessToken = result.accessToken;
  session.accessTokenExpiresAt = result.accessTokenExpiresAt;
  session.agencyName = result.agencyName;
  session.operatorName = result.operatorName;
  session.ttdAccountLabel = result.ttdAccountLabel;
  session.bookingCategory = result.bookingCategory;
  session.pilgrimCount = result.pilgrimCount;
  session.donationAmount = result.donationAmount;
  session.validationStatus = result.validationStatus;
  session.workflowStatus = result.workflowStatus;
  session.contentRevision = result.contentRevision;
  session.lastSyncedAt = new Date().toISOString();
  await saveSession(session);

  cachedPayload = await loadPayload(session);
  session.selectedPilgrimIds = cachedPayload.pilgrims.map((p) => p.id);
  await saveSession(session);

  return {
    ok: true,
    event: 'EXTENSION_PAIR_SUCCESS',
    session,
    payload: cachedPayload,
    validation: auditPreparedPayload(cachedPayload),
  };
}

async function ensureFreshAccess(session: ExtensionSession) {
  if (!accessTokenExpiringSoon(session)) return session;
  const refreshed = await apiRefreshAccess(session.apiBaseUrl, sessionAuth(session));
  session.accessToken = refreshed.accessToken;
  session.accessTokenExpiresAt = refreshed.accessTokenExpiresAt;
  await saveSession(session);
  return session;
}

async function loadPayload(session: ExtensionSession) {
  const s = await ensureFreshAccess(session);
  const payload = await apiFillPayload(s.apiBaseUrl, sessionAuth(s), s.selectedPilgrimIds);
  if (
    cachedPayloadRevision != null &&
    payload.contentRevision != null &&
    payload.contentRevision !== cachedPayloadRevision
  ) {
    cachedPayload = null;
  }
  cachedPayload = payload;
  cachedPayloadRevision = payload.contentRevision;
  return payload;
}

async function syncPreparation(): Promise<ProtocolResponse> {
  const session = await requireSession();
  const s = await ensureFreshAccess(session);
  const sync = await apiSessionSync(s.apiBaseUrl, sessionAuth(s));
  if (sync.contentRevision != null && cachedPayloadRevision != null && sync.contentRevision !== cachedPayloadRevision) {
    cachedPayload = null;
  }
  s.lastSyncedAt = new Date().toISOString();
  s.contentRevision = sync.contentRevision;
  s.validationStatus = sync.validationStatus;
  s.workflowStatus = sync.workflowStatus;
  s.donationAmount = sync.donationAmount;
  s.operatorName = sync.operatorName;
  await saveSession(s);
  cachedPayload = await loadPayload(s);
  return { ok: true, event: 'PREPARATION_SYNC', session: s, sync, payload: cachedPayload };
}

async function selectPilgrims(pilgrimIds: string[]): Promise<ProtocolResponse> {
  const session = await requireSession();
  session.selectedPilgrimIds = pilgrimIds;
  await saveSession(session);
  cachedPayload = await loadPayload(session);
  return {
    ok: true,
    session,
    payload: cachedPayload,
    validation: auditPreparedPayload(cachedPayload),
  };
}

async function openSupportedForm(): Promise<ProtocolResponse> {
  const session = await loadSession();
  const base = session?.apiBaseUrl || 'http://localhost:4000';
  await chrome.tabs.create({ url: `${base}/mock-booking/?pilgrims=4` });
  return { ok: true, event: 'FORM_DETECTED' };
}

async function openOfficialPortal(): Promise<ProtocolResponse> {
  await chrome.tabs.create({ url: 'https://tirupatibalaji.ap.gov.in/#/login' });
  return {
    ok: true,
    event: 'SESSION_STATUS_CHANGED',
    error:
      'Opened official portal for operator login. Autofill is only enabled on verified supported pages (local mock in dev).',
  };
}

async function refreshSessionFromBackend(session: ExtensionSession) {
  const s = await ensureFreshAccess(session);
  const sync = await apiSessionSync(s.apiBaseUrl, sessionAuth(s));
  if (sync.validationStatus !== 'passed') {
    throw Object.assign(
      new Error('Preparation validation failed or expired — re-validate in DarshanDesk dashboard'),
      { code: 'VALIDATION' }
    );
  }
  if (
    sync.contentRevision != null &&
    cachedPayloadRevision != null &&
    sync.contentRevision !== cachedPayloadRevision
  ) {
    cachedPayload = null;
  }
  s.lastSyncedAt = new Date().toISOString();
  s.contentRevision = sync.contentRevision;
  s.validationStatus = sync.validationStatus;
  s.workflowStatus = sync.workflowStatus;
  s.donationAmount = sync.donationAmount;
  s.bookingCategory = sync.bookingCategory;
  s.operatorName = sync.operatorName;
  await saveSession(s);
  return s;
}

async function fillActiveTab(allowOverwrite: boolean, validateOnly = false): Promise<ProtocolResponse> {
  return withExtensionActionLock('fill', async () => {
  if (!validateOnly) assertPageAssistAllowed();
  let session = await requireSession();
  session = await refreshSessionFromBackend(session);
  cachedPayload = await loadPayload(session);
  if (
    session.contentRevision != null &&
    cachedPayload.contentRevision != null &&
    session.contentRevision !== cachedPayload.contentRevision
  ) {
    session.contentRevision = cachedPayload.contentRevision;
    await saveSession(session);
  }
  await apiHeartbeat(session.apiBaseUrl, sessionAuth(session));

  const audit = auditPreparedPayload(cachedPayload);
  if (!audit.ok) {
    return { ok: false, error: audit.errors.join('; '), validation: audit, errorCode: 'VALIDATION' };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');

  let response: Record<string, unknown>;
  try {
    response = await chrome.tabs.sendMessage(tab.id, {
      type: 'FORM_FILL_REQUEST',
      payload: cachedPayload,
      selectedIds: session.selectedPilgrimIds,
      preparationId: cachedPayload.preparationId,
      mappingProfileId: cachedPayload.mappingProfileId,
      allowOverwrite,
      validateOnly,
      duplicateSessionKey: session.preparationId || 'unknown',
    });
  } catch {
    throw new Error(
      'Unsupported page or content script not loaded — open the supported mock form from DarshanDesk'
    );
  }

  const validation = response.validation as { ok?: boolean } | undefined;
  const locallyOk = validateOnly
    ? Boolean(validation?.ok)
    : Boolean(response.success) && Boolean(validation?.ok);

  if (!validateOnly && locallyOk) {
    try {
      await apiFillReport(session.apiBaseUrl, sessionAuth(session), response);
    } catch {
      return {
        ok: false,
        error:
          'Fields filled on page but dashboard sync failed — your draft is preserved in DarshanDesk; retry sync after checking network.',
        event: 'FORM_FILL_RESULT',
        fillReport: response,
        validation: response.validation,
        errorCode: 'SYNC_FAILED',
      };
    }
  }

  return {
    ok: locallyOk,
    event: 'FORM_FILL_RESULT',
    fillReport: response,
    validation: response.validation,
  };
  });
}

async function disconnect(): Promise<ProtocolResponse> {
  const session = await loadSession();
  if (session?.connected && session.accessToken) {
    try {
      await apiDisconnect(session.apiBaseUrl, sessionAuth(session));
    } catch {
      /* still clear local session */
    }
  }
  await clearSession();
  cachedPayload = null;
  return { ok: true, event: 'DISCONNECT' };
}

async function requireSession(): Promise<ExtensionSession> {
  const session = await loadSession();
  if (!session?.connected || !session.accessToken) {
    throw Object.assign(new Error('Extension session not connected — open Preparation and mark ready, then Reconnect here'), {
      code: 'NOT_PAIRED',
    });
  }
  return session;
}