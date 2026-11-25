import { detectSrivaniPagePhase, findContinueButton, isActionable, type SrivaniPagePhase } from './liveSrivaniAssist.js';

export type QuotaStatusSnapshot = {
  quotaReleaseTime: string | null;
  systemTime: string | null;
  remainingTime: string | null;
  availableQuota: string | null;
  reportingTime: string | null;
  paymentPending: string | null;
  successCount: string | null;
};

export type ContinueOperatorStatus =
  | 'no_button'
  | 'waiting_for_continue'
  | 'ready_to_continue'
  | 'navigating_loading'
  | 'payment_summary'
  | 'payment_gateway'
  | 'error';

export type ContinueReadinessState = {
  buttonPresent: boolean;
  buttonEnabled: boolean;
  loadingOverlay: boolean;
  errorVisible: boolean;
  readyToContinue: boolean;
  buttonLabel: string | null;
  disabledReason: string | null;
  status: ContinueOperatorStatus;
  statusLabel: string;
  /** Block fill / booking assist while official page is loading after Continue */
  blockExtensionAssist: boolean;
  errorMessage: string | null;
};

export type PaymentSummarySnapshot = {
  donationAmount: string | null;
  darshanAmount: string | null;
  totalPayable: string | null;
  pilgrimCount: string | null;
  gatewayOptions: string[];
  summaryVisible: boolean;
};

export type PageMonitorSnapshot = {
  pageUrl: string;
  supported: boolean;
  phase: SrivaniPagePhase | 'mock' | 'unsupported';
  quota: QuotaStatusSnapshot;
  continue: ContinueReadinessState;
  payment: PaymentSummarySnapshot;
  observedAtUtc: string;
  source: 'live' | 'mock' | 'none';
};

export type ContinueMonitorContext = {
  /** Set when the operator clicks Continue (passive listener — extension never clicks). */
  userContinuePending?: boolean;
};

const QUOTA_LABELS: Array<{ key: keyof QuotaStatusSnapshot; patterns: RegExp[] }> = [
  { key: 'quotaReleaseTime', patterns: [/quota\s*release\s*time/i, /release\s*time/i] },
  { key: 'systemTime', patterns: [/system\s*time/i] },
  { key: 'remainingTime', patterns: [/remaining\s*time/i, /time\s*remaining/i] },
  { key: 'availableQuota', patterns: [/available\s*quota/i, /quota\s*for\s*\(?current/i] },
  { key: 'reportingTime', patterns: [/reporting\s*time/i] },
  { key: 'paymentPending', patterns: [/payment\s*pending/i] },
  { key: 'successCount', patterns: [/^success$/i, /success\s*count/i] },
];

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function valueAfterLabel(line: string, labelPattern: RegExp): string | null {
  const m = line.match(labelPattern);
  if (!m) return null;
  const rest = line.slice(m.index! + m[0].length).replace(/^[\s:：\-–]+/, '').trim();
  if (!rest || rest === '—' || rest === '-') return null;
  return rest;
}

function extractQuotaFromInlineText(blob: string): QuotaStatusSnapshot {
  const empty: QuotaStatusSnapshot = {
    quotaReleaseTime: null,
    systemTime: null,
    remainingTime: null,
    availableQuota: null,
    reportingTime: null,
    paymentPending: null,
    successCount: null,
  };
  const out = { ...empty };
  for (const { key, patterns } of QUOTA_LABELS) {
    if (out[key] != null) continue;
    for (const pattern of patterns) {
      const re = new RegExp(`${pattern.source}[\\s:：\\-–]*([^\\n\\r]{1,48})`, 'i');
      const m = blob.match(re);
      const v = m?.[1] ? normalizeWhitespace(m[1]) : null;
      if (v && v.length < 40) {
        out[key] = v;
        break;
      }
    }
  }
  return out;
}

/** Parse label/value pairs from visible page text (live TTD layout). */
export function extractQuotaFromBodyText(doc: Document): QuotaStatusSnapshot {
  const text = doc.body?.innerText || '';
  if (!text.trim()) {
    return extractQuotaFromInlineText('');
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => normalizeWhitespace(l))
    .filter(Boolean);

  const lineParsed = extractQuotaFromInlineText('');
  for (const line of lines) {
    for (const { key, patterns } of QUOTA_LABELS) {
      if (lineParsed[key] != null) continue;
      for (const pattern of patterns) {
        const v = valueAfterLabel(line, pattern);
        if (v) {
          lineParsed[key] = v;
          break;
        }
      }
    }
  }

  const inline = extractQuotaFromInlineText(text);
  return {
    quotaReleaseTime: lineParsed.quotaReleaseTime ?? inline.quotaReleaseTime,
    systemTime: lineParsed.systemTime ?? inline.systemTime,
    remainingTime: lineParsed.remainingTime ?? inline.remainingTime,
    availableQuota: lineParsed.availableQuota ?? inline.availableQuota,
    reportingTime: lineParsed.reportingTime ?? inline.reportingTime,
    paymentPending: lineParsed.paymentPending ?? inline.paymentPending,
    successCount: lineParsed.successCount ?? inline.successCount,
  };
}

function readMockQuotaField(doc: Document, field: string): string | null {
  const el = doc.querySelector(`[data-dd-quota="${field}"]`);
  if (!el) return null;
  const raw = (el.textContent || '').trim();
  return raw || null;
}

export function extractMockQuotaBar(doc: Document): QuotaStatusSnapshot {
  return {
    quotaReleaseTime: readMockQuotaField(doc, 'quotaReleaseTime'),
    systemTime: readMockQuotaField(doc, 'systemTime'),
    remainingTime: readMockQuotaField(doc, 'remainingTime'),
    availableQuota: readMockQuotaField(doc, 'availableQuota'),
    reportingTime: readMockQuotaField(doc, 'reportingTime'),
    paymentPending: readMockQuotaField(doc, 'paymentPending'),
    successCount: readMockQuotaField(doc, 'successCount'),
  };
}

export function detectLoadingOverlay(doc: Document): boolean {
  const byId = doc.getElementById('mock-official-loading');
  if (byId && isOverlayVisible(byId)) return true;

  const candidates = [...doc.querySelectorAll('[class*="loading"], [class*="spinner"], [class*="overlay"], [id*="loading"]')];
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.id === 'dd-fill-overlay-root') continue;
    if (!isOverlayVisible(el)) continue;
    const text = (el.textContent || '').toLowerCase();
    const cls = el.className.toLowerCase();
    if (text.includes('loading') || text.includes('please wait') || cls.includes('loading') || cls.includes('overlay')) {
      return true;
    }
  }
  const bodyText = (doc.body?.innerText || '').slice(0, 4000).toLowerCase();
  if (/please\s+wait[^.]{0,40}loading/i.test(bodyText)) return true;
  return false;
}

function isOverlayVisible(el: HTMLElement): boolean {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  if (style && parseFloat(style.opacity) < 0.1) return false;
  return true;
}

function detectPageError(doc: Document): string | null {
  const text = (doc.body?.innerText || '').slice(0, 12_000);
  const lower = text.toLowerCase();
  if (/session\s*expired|please\s*login\s*again|log\s*in\s*again/i.test(lower)) {
    return 'Official session expired — log in again on TTD';
  }
  if (/quota\s*exceeded|cannot\s*book/i.test(lower)) {
    return 'Quota unavailable or booking rejected on official page';
  }
  if (/not\s*available/i.test(lower) && /quota/i.test(lower)) {
    return 'Quota not available';
  }
  return null;
}

function readDisabledReason(btn: HTMLElement): string | null {
  if (!btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
    const ngDisabled = btn.getAttribute('ng-disabled') ?? btn.getAttribute('data-ng-disabled');
    if (ngDisabled !== 'true' && ngDisabled !== 'disabled') {
      if (!/\bdisabled\b/i.test(btn.className)) return null;
    }
  }
  if (btn.hasAttribute('disabled')) return 'disabled attribute';
  if (btn.getAttribute('aria-disabled') === 'true') return 'aria-disabled';
  const ng = btn.getAttribute('ng-disabled') ?? btn.getAttribute('data-ng-disabled');
  if (ng === 'true' || ng === 'disabled') return 'ng-disabled';
  if (/\bdisabled\b/i.test(btn.className)) return 'CSS disabled class';
  const style = btn.ownerDocument.defaultView?.getComputedStyle(btn);
  if (style?.pointerEvents === 'none') return 'pointer-events: none';
  if (style && parseFloat(style.opacity) < 0.35) return 'low opacity';
  return 'not actionable';
}

const STATUS_LABELS: Record<ContinueOperatorStatus, string> = {
  no_button: 'Continue button not found on this page',
  waiting_for_continue: 'Waiting for Continue',
  ready_to_continue: 'Ready to Continue',
  navigating_loading: 'Loading — wait for payment step',
  payment_summary: 'Payment summary — review and proceed manually',
  payment_gateway: 'Payment gateway — Pay Now is manual',
  error: 'Official page error',
};

export function deriveContinueOperatorStatus(
  doc: Document,
  phase: SrivaniPagePhase | 'mock' | 'unsupported',
  ctx: ContinueMonitorContext = {}
): ContinueReadinessState {
  const btn = findContinueButton(doc);
  const loadingOverlay = detectLoadingOverlay(doc);
  const errorMessage = detectPageError(doc);
  const buttonEnabled = btn ? isActionable(btn) : false;
  const disabledReason = btn && !buttonEnabled ? readDisabledReason(btn) : null;

  let status: ContinueOperatorStatus;
  if (errorMessage) {
    status = 'error';
  } else if (phase === 'payment_gateway') {
    status = 'payment_gateway';
  } else if (phase === 'payment_summary') {
    status = 'payment_summary';
  } else if (loadingOverlay && ctx.userContinuePending) {
    status = 'navigating_loading';
  } else if (!btn) {
    status = 'no_button';
  } else if (buttonEnabled && !loadingOverlay) {
    status = 'ready_to_continue';
  } else {
    status = 'waiting_for_continue';
  }

  const readyToContinue = status === 'ready_to_continue';
  const blockExtensionAssist = status === 'navigating_loading' || (loadingOverlay && Boolean(ctx.userContinuePending));

  return {
    buttonPresent: Boolean(btn),
    buttonEnabled,
    loadingOverlay,
    errorVisible: Boolean(errorMessage),
    readyToContinue,
    buttonLabel: btn ? normalizeWhitespace(btn.textContent || '') || null : null,
    disabledReason,
    status,
    statusLabel: errorMessage ? `${STATUS_LABELS.error}: ${errorMessage}` : STATUS_LABELS[status],
    blockExtensionAssist,
    errorMessage,
  };
}

export function readContinueReadiness(doc: Document, ctx?: ContinueMonitorContext): ContinueReadinessState {
  const phase = resolveMonitorPhase(doc);
  return deriveContinueOperatorStatus(doc, phase, ctx);
}

function resolveMonitorPhase(doc: Document): SrivaniPagePhase | 'mock' | 'unsupported' {
  if (isMockBookingPage(doc)) {
    const step = doc.body?.getAttribute('data-dd-active-step') || '';
    if (step === 'payment-summary') return 'payment_summary';
    if (step === 'payment-gateway') return 'payment_gateway';
    if (step === 'pilgrims' || step === 'quota') return 'pilgrim_confirm';
    return 'mock';
  }
  if (isOfficialTtdHost(doc.location?.hostname || '')) {
    return detectSrivaniPagePhase(doc, doc.location?.href || '');
  }
  return 'unsupported';
}

export function observeContinueReadiness(
  doc: Document,
  onChange: (state: ContinueReadinessState) => void,
  getContext?: () => ContinueMonitorContext
): () => void {
  const tick = () => onChange(readContinueReadiness(doc, getContext?.()));
  tick();
  const obs = new MutationObserver(() => tick());
  obs.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'class', 'aria-disabled', 'hidden', 'style', 'ng-disabled'],
    characterData: true,
  });
  const win = doc.defaultView;
  const interval = win ? win.setInterval(tick, 1000) : undefined;
  return () => {
    obs.disconnect();
    if (interval != null && win) win.clearInterval(interval);
  };
}

function matchCurrency(block: string): string | null {
  const m = block.match(/(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i);
  return m ? m[0].replace(/\s+/g, ' ') : null;
}

export function extractPaymentSummary(doc: Document): PaymentSummarySnapshot {
  if (isMockBookingPage(doc) && doc.body?.getAttribute('data-dd-active-step') === 'payment-summary') {
    return {
      donationAmount: readMockQuotaField(doc, 'mockDonation') || '₹10,000',
      darshanAmount: readMockQuotaField(doc, 'mockDarshan') || '₹300',
      totalPayable: readMockQuotaField(doc, 'mockTotal') || '₹10,300',
      pilgrimCount: readMockQuotaField(doc, 'mockPilgrimCount') || String(1),
      gatewayOptions: ['ICICI', 'HDFC', 'Union Bank'],
      summaryVisible: true,
    };
  }

  const text = doc.body?.innerText || '';
  const gateways: string[] = [];
  for (const gw of ['ICICI', 'HDFC', 'Union Bank', 'Union']) {
    if (new RegExp(gw, 'i').test(text)) gateways.push(gw);
  }

  const donation =
    text.match(/donation[^₹\n]{0,40}((?:Rs\.?|₹)\s*[\d,]+)/i)?.[1]?.trim() ||
    text.match(/trust\s*donation[^₹\n]{0,30}((?:Rs\.?|₹)\s*[\d,]+)/i)?.[1]?.trim() ||
    null;
  const darshan =
    text.match(/darshan[^₹\n]{0,40}((?:Rs\.?|₹)\s*[\d,]+)/i)?.[1]?.trim() ||
    text.match(/break\s*darshan[^₹\n]{0,30}((?:Rs\.?|₹)\s*[\d,]+)/i)?.[1]?.trim() ||
    null;
  const total =
    text.match(/total[^₹\n]{0,30}((?:Rs\.?|₹)\s*[\d,]+)/i)?.[1]?.trim() ||
    matchCurrency(text.match(/payable[^₹\n]{0,40}/i)?.[0] || '') ||
    null;
  const pilgrimCount =
    text.match(/(\d+)\s*pilgrim/i)?.[1]?.trim() ||
    text.match(/no\.?\s*of\s*pilgrims[^0-9]*(\d+)/i)?.[1]?.trim() ||
    null;

  const phase = resolveMonitorPhase(doc);
  const summaryVisible = phase === 'payment_summary' || phase === 'payment_gateway';

  return {
    donationAmount: donation,
    darshanAmount: darshan,
    totalPayable: total,
    pilgrimCount,
    gatewayOptions: [...new Set(gateways)],
    summaryVisible,
  };
}

export function isOfficialTtdHost(hostname: string): boolean {
  return /tirupatibalaji\.ap\.gov\.in|ttdevasthanams\.ap\.gov\.in/i.test(hostname);
}

export function isMockBookingPage(doc: Document): boolean {
  return doc.body?.getAttribute('data-dd-mapping') === 'mock-srivani-v1';
}

export function buildPageMonitorSnapshot(
  doc: Document,
  href = doc.location?.href || '',
  ctx?: ContinueMonitorContext
): PageMonitorSnapshot {
  const mock = isMockBookingPage(doc);
  const official = isOfficialTtdHost(doc.location?.hostname || '');
  const supported = mock || official;
  const phase = resolveMonitorPhase(doc);

  const quota =
    mock && (phase === 'pilgrim_confirm' || phase === 'mock' || phase === 'payment_summary')
      ? extractMockQuotaBar(doc)
      : supported
        ? extractQuotaFromBodyText(doc)
        : extractQuotaFromBodyText(doc);

  return {
    pageUrl: href,
    supported,
    phase,
    quota,
    continue: deriveContinueOperatorStatus(doc, phase, ctx),
    payment: extractPaymentSummary(doc),
    observedAtUtc: new Date().toISOString(),
    source: mock ? 'mock' : official ? 'live' : 'none',
  };
}

export function observePageMonitor(
  doc: Document,
  onChange: (snapshot: PageMonitorSnapshot) => void,
  getContext?: () => ContinueMonitorContext
): () => void {
  const tick = () => onChange(buildPageMonitorSnapshot(doc, doc.location?.href || '', getContext?.()));
  tick();
  const stopContinue = observeContinueReadiness(doc, () => tick(), getContext);
  const obs = new MutationObserver(() => tick());
  obs.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  const win = doc.defaultView;
  const onNav = () => tick();
  win?.addEventListener('pagehide', onNav);
  return () => {
    stopContinue();
    obs.disconnect();
    win?.removeEventListener('pagehide', onNav);
  };
}

/** Passive listener — records operator Continue clicks only (never triggers click). */
export function attachOperatorContinueListener(
  doc: Document,
  onOperatorContinue: () => void
): () => void {
  const handler = (e: Event) => {
    const btn = findContinueButton(doc);
    if (!btn) return;
    const target = e.target;
    if (target !== btn && !(target instanceof Node && btn.contains(target))) return;
    onOperatorContinue();
  };
  doc.addEventListener('click', handler, true);
  return () => doc.removeEventListener('click', handler, true);
}