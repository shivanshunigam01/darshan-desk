import {
  buildFillPlan,
  countVisiblePilgrimBlocks,
  detectCaptchaRequired,
  executeFillPlan,
  fillLiveSrivaniPilgrims,
  isLiveSrivaniPilgrimPage,
  runSrivaniBookingAssist,
  mapPilgrimRowsById,
  orderPilgrimsBySelection,
  verifyFillResults,
  waitForDomReady,
  type FieldFillResult,
  type FillPlanItem,
} from '@darshan-desk/fill-engine';
import { hideFillOverlay, showFillOverlay, updateFillOverlayStatus } from './fill-overlay';

const MOCK_PROFILES = new Set(['mock-srivani-v1']);

function detectMockForm() {
  const profile = document.body.getAttribute('data-dd-mapping');
  if (!profile || !MOCK_PROFILES.has(profile)) return null;
  return {
    mappingProfileId: profile,
    formVersion: document.body.getAttribute('data-dd-form-version') || '1',
    step: document.body.getAttribute('data-dd-active-step') || 'unknown',
    url: location.href,
  };
}

function detectLiveForm() {
  if (!isLiveSrivaniPilgrimPage(document)) return null;
  return {
    mappingProfileId: 'live-srivani-current-v1',
    formVersion: '1',
    step: 'pilgrims',
    url: location.href,
  };
}

function detectForm() {
  return detectMockForm() || detectLiveForm();
}

async function announceFormDetected() {
  const detection = detectForm();
  if (!detection) return;
  try {
    await chrome.runtime.sendMessage({ type: 'FORM_DETECTED', detection });
  } catch {
    /* popup may be closed */
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'FORM_FILL_REQUEST') {
    runFill(message)
      .then((report) => sendResponse(report))
      .catch((err: Error) =>
        sendResponse({
          success: false,
          event: 'FORM_FILL_RESULT',
          results: [],
          error: err.message,
          errorCode: err.message.includes('Timed out') ? 'SLOW_PAGE' : 'FILL_FAILED',
        })
      );
    return true;
  }
  if (message?.type === 'FORM_DETECTED') {
    sendResponse({ ok: true, detection: detectForm() });
    return;
  }
  if (message?.type === 'SRIVANI_BOOKING_ASSIST_REQUEST') {
    runBookingAssist(message)
      .then((report) => sendResponse(report))
      .catch((err: Error) =>
        sendResponse({ success: false, steps: [], phase: 'unknown', payNowReady: false, message: err.message })
      );
    return true;
  }
  if (message?.type === 'FILL_PAGE_OVERLAY') {
    if (message.show) {
      if (document.getElementById('dd-fill-overlay-root')) {
        updateFillOverlayStatus(document, message.status || 'Working…');
      } else {
        showFillOverlay(document, message.status || 'Working…', message.title || 'DarshanDesk autofill');
      }
    } else {
      hideFillOverlay(document);
    }
    sendResponse({ ok: true });
    return;
  }
  return false;
});

async function runBookingAssist(message: {
  autoContinue?: boolean;
  autoPaymentGateway?: boolean;
  preferredGateway?: 'ICICI' | 'HDFC' | 'UNION' | 'ANY';
}) {
  if (!/tirupatibalaji\.ap\.gov\.in/i.test(location.hostname)) {
    throw new Error('Open the official TTD SRIVANI booking tab first');
  }
  showFillOverlay(document, 'Complete CAPTCHA if shown — waiting for Continue…', 'DarshanDesk booking assist');
  try {
    return await runSrivaniBookingAssist(document, {
      autoContinue: message.autoContinue !== false,
      autoPaymentGateway: message.autoPaymentGateway !== false,
      preferredGateway: message.preferredGateway || 'ANY',
      onStatus: (line) => updateFillOverlayStatus(document, line),
    });
  } finally {
    hideFillOverlay(document);
  }
}

async function runFill(message: {
  plan?: FillPlanItem[];
  preparationId: string;
  mappingProfileId: string;
  allowOverwrite: boolean;
  validateOnly?: boolean;
  duplicateSessionKey: string;
  payload?: Parameters<typeof buildFillPlan>[0];
  selectedIds?: string[];
}) {
  const detection = detectForm();
  if (!detection) {
    throw new Error(
      'Unsupported page — open Pilgrim Details on live TTD (SRIVANI) or the local mock booking pilgrims step'
    );
  }

  const overlayTitle = message.validateOnly ? 'Checking fields' : 'Applying fields';
  const overlayStatus = message.validateOnly ? 'Reading visible pilgrim fields…' : 'Preparing autofill…';
  showFillOverlay(document, overlayStatus, overlayTitle);

  try {
    return await runFillCore(message, detection);
  } finally {
    hideFillOverlay(document);
  }
}

async function runFillCore(
  message: {
    plan?: FillPlanItem[];
    preparationId: string;
    mappingProfileId: string;
    allowOverwrite: boolean;
    validateOnly?: boolean;
    duplicateSessionKey: string;
    payload?: Parameters<typeof buildFillPlan>[0];
    selectedIds?: string[];
  },
  detection: { mappingProfileId: string; formVersion: string; step: string; url: string }
) {
  await waitForDomReady(document);

  if (detection.mappingProfileId === 'live-srivani-current-v1') {
    return runLiveFill(message, detection);
  }

  updateFillOverlayStatus(document, 'Waiting for form fields…');
  await waitForSelector('[data-dd-field]', 12_000);

  if (detectCaptchaRequired(document)) {
    return captchaBlockedReport(message, detection.mappingProfileId);
  }

  if (detection.step !== 'pilgrims' && detection.step !== 'booking' && detection.step !== 'declaration') {
    throw new Error('Open the pilgrims step before fill — unsupported active step');
  }

  const selectedIds = message.selectedIds || message.payload?.pilgrims.map((p) => p.id) || [];
  const visibleRows = countVisiblePilgrimBlocks(document);
  if (visibleRows > 0 && selectedIds.length > visibleRows) {
    throw new Error(`Form has ${visibleRows} pilgrim rows but ${selectedIds.length} selected — adjust selection or form`);
  }

  const rowIndexByPilgrimId = mapPilgrimRowsById(document, selectedIds);
  const plan =
    message.plan ??
    buildFillPlan(message.payload!, selectedIds, {
      includeScalars: detection.step === 'booking',
      rowIndexByPilgrimId,
    });

  const startedAtUtc = new Date().toISOString();
  if (!message.validateOnly) {
    updateFillOverlayStatus(document, `Applying ${plan.length} field${plan.length === 1 ? '' : 's'}…`);
  }
  const results: FieldFillResult[] = message.validateOnly
    ? dryRunPlan(document, plan)
    : executeFillPlan(document, plan, {
        allowOverwrite: message.allowOverwrite,
        duplicateSessionKey: message.duplicateSessionKey,
      });
  if (!message.validateOnly) {
    updateFillOverlayStatus(document, 'Verifying filled values…');
  }
  const validation = verifyFillResults(plan, results);
  return finishReport(message, detection.mappingProfileId, startedAtUtc, results, validation);
}

function runLiveFill(
  message: {
    preparationId: string;
    allowOverwrite: boolean;
    validateOnly?: boolean;
    payload?: Parameters<typeof buildFillPlan>[0];
    selectedIds?: string[];
  },
  detection: { mappingProfileId: string }
) {
  if (!message.payload?.pilgrims?.length) {
    throw new Error('No pilgrim payload — connect and sync from DarshanDesk first');
  }
  const selectedIds = message.selectedIds || message.payload.pilgrims.map((p) => p.id) || [];
  const pilgrims = orderPilgrimsBySelection(message.payload, selectedIds);
  const startedAtUtc = new Date().toISOString();
  if (!message.validateOnly) {
    updateFillOverlayStatus(document, `Applying ${pilgrims.length} pilgrim${pilgrims.length === 1 ? '' : 's'}…`);
  }
  const results: FieldFillResult[] = message.validateOnly
    ? pilgrims.flatMap((p, i) => [
        {
          key: `p${i}_fullName`,
          displayLabel: `Pilgrim ${i + 1} name`,
          status: 'missing_value' as const,
          expected: p.fullName,
          message: 'Validate-only on live TTD — run fill to apply',
        },
      ])
    : fillLiveSrivaniPilgrims(document, pilgrims, {
        allowOverwrite: message.allowOverwrite,
        onProgress: (line) => updateFillOverlayStatus(document, line),
      });
  const fieldErrors = results
    .filter((r) => !['verified', 'skipped_declined', 'needs_confirmation'].includes(r.status))
    .map((r) => ({ key: r.key, label: r.displayLabel, message: r.message || r.status }));
  const validation = { ok: fieldErrors.length === 0, fieldErrors };
  return finishReport(message, detection.mappingProfileId, startedAtUtc, results, validation);
}

function captchaBlockedReport(
  message: { preparationId: string },
  mappingProfileId: string
) {
  return {
    event: 'FORM_VALIDATION_RESULT',
    preparationId: message.preparationId,
    mappingProfileId,
    pageUrl: location.href,
    startedAtUtc: new Date().toISOString(),
    completedAtUtc: new Date().toISOString(),
    results: [
      {
        key: 'captcha',
        displayLabel: 'CAPTCHA',
        status: 'captcha_required' as const,
        message: 'CAPTCHA verification required — complete on the official website.',
      },
    ],
    validation: { ok: false, fieldErrors: [{ key: 'captcha', label: 'CAPTCHA', message: 'Complete CAPTCHA on the official website' }] },
    success: false,
    captchaRequired: true,
  };
}

function finishReport(
  message: { preparationId: string; payload?: { contentRevision?: number } },
  mappingProfileId: string,
  startedAtUtc: string,
  results: FieldFillResult[],
  validation: { ok: boolean; fieldErrors?: Array<{ key: string; label: string; message: string }> }
) {
  const completedAtUtc = new Date().toISOString();
  const report = {
    event: 'FORM_VALIDATION_RESULT',
    preparationId: message.preparationId,
    mappingProfileId,
    contentRevision: message.payload?.contentRevision,
    pageUrl: location.href,
    startedAtUtc,
    completedAtUtc,
    results,
    validation,
    success:
      validation.ok &&
      results.every((r) =>
        ['verified', 'skipped_declined', 'skipped_duplicate', 'needs_confirmation'].includes(r.status)
      ),
  };
  try {
    void chrome.runtime.sendMessage(report);
  } catch {
    /* non-fatal */
  }
  return report;
}

function dryRunPlan(doc: Document, plan: FillPlanItem[]): FieldFillResult[] {
  return plan.map((item) => {
    const def = item.definition;
    if (def.sourceProfileField === '_skip') {
      return { key: def.key, displayLabel: def.displayLabel, status: 'skipped_declined', message: 'Consent never auto-filled' };
    }
    const el = doc.querySelector(`[data-dd-field="${def.selectorStrategy.value}"]`);
    if (!el || !(el instanceof HTMLElement)) {
      return { key: def.key, displayLabel: def.displayLabel, status: 'missing_element', expected: item.value, message: 'Field missing on page' };
    }
    const current = (el as HTMLInputElement).value || '';
    const matches = current.trim().toLowerCase() === item.value.trim().toLowerCase();
    return {
      key: def.key,
      displayLabel: def.displayLabel,
      status: matches ? 'verified' : current ? 'needs_confirmation' : 'missing_value',
      expected: item.value,
      actual: current || undefined,
      message: matches ? 'Already matches profile' : current ? 'Differs from profile' : 'Empty — ready to fill',
    };
  });
}

function waitForSelector(selector: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const found = () => document.querySelector(selector);
    if (found()) {
      resolve();
      return;
    }
    const obs = new MutationObserver(() => {
      if (found()) {
        obs.disconnect();
        clearTimeout(timer);
        resolve();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      obs.disconnect();
      if (found()) resolve();
      else reject(new Error(`Timed out waiting for ${selector} (page rerender/slow load)`));
    }, timeoutMs);
  });
}

void waitForDomReady(document).then(() => {
  setTimeout(announceFormDetected, 350);
});

const stepObs = new MutationObserver(() => {
  void announceFormDetected();
});
stepObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dd-active-step'] });