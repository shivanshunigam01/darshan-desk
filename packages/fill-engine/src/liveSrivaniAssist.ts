import { isVisible } from './domFill.js';

export type SrivaniPagePhase = 'pilgrim_confirm' | 'payment_summary' | 'payment_gateway' | 'unknown';

export type PaymentGatewayPreference = 'ICICI' | 'HDFC' | 'UNION' | 'ANY';

export type BookingAssistOptions = {
  autoContinue: boolean;
  autoPaymentGateway: boolean;
  preferredGateway: PaymentGatewayPreference;
  maxWaitMs?: number;
  onStatus?: (message: string) => void;
};

export type BookingAssistReport = {
  success: boolean;
  steps: Array<{ step: string; ok: boolean; detail?: string }>;
  phase: SrivaniPagePhase;
  payNowReady: boolean;
  message?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function detectSrivaniPagePhase(doc: Document, href = doc.location?.href || ''): SrivaniPagePhase {
  const text = (doc.body?.innerText || '').slice(0, 12000);
  if (/edonationConfirmCurrentSrivani|edonationconfirmcurrentsrivani/i.test(href)) return 'pilgrim_confirm';
  if (/edonationCurrentSrivanipay|edonationcurrentsrivanipay/i.test(href)) return 'payment_gateway';
  if (/payment gateway/i.test(text) && /pay now/i.test(text)) return 'payment_gateway';
  if (/donation and darshan payment summary|payment summary/i.test(text)) return 'payment_summary';
  if (/pilgrim details/i.test(text) && /continue/i.test(text)) return 'pilgrim_confirm';
  return 'unknown';
}

function clickableCandidates(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]')].filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  );
}

export function findButtonByLabel(doc: Document, pattern: RegExp): HTMLElement | null {
  for (const el of clickableCandidates(doc)) {
    const label = `${el.textContent || ''} ${el.getAttribute('value') || ''} ${el.getAttribute('aria-label') || ''}`.trim();
    if (pattern.test(label) && isVisible(el)) return el;
  }
  return null;
}

export function findContinueButton(doc: Document): HTMLElement | null {
  for (const el of clickableCandidates(doc)) {
    const label = `${el.textContent || ''} ${el.getAttribute('value') || ''}`.trim();
    if (!/\bcontinue\b/i.test(label)) continue;
    if (/pay\s*now/i.test(label)) continue;
    if (isVisible(el)) return el;
  }
  return null;
}

export function isActionable(el: HTMLElement): boolean {
  if (!isVisible(el)) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (/\bdisabled\b/i.test(el.className)) return false;
  const ngDisabled = el.getAttribute('ng-disabled') ?? el.getAttribute('data-ng-disabled');
  if (ngDisabled === 'true' || ngDisabled === 'disabled') return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style?.pointerEvents === 'none') return false;
  if (style && parseFloat(style.opacity) < 0.35) return false;
  return true;
}

export function humanClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView || undefined }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView || undefined }));
  el.click();
}

export async function waitAndClickContinue(
  doc: Document,
  options: { maxWaitMs?: number; intervalMs?: number; onStatus?: (s: string) => void }
): Promise<{ clicked: boolean; detail?: string }> {
  const maxWaitMs = options.maxWaitMs ?? 45 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 300;
  const started = Date.now();
  const before = doc.location?.href || '';
  let seenDisabled = false;

  while (Date.now() - started < maxWaitMs) {
    const btn = findContinueButton(doc);
    if (!btn) {
      options.onStatus?.('Looking for Continue button…');
      await sleep(intervalMs);
      continue;
    }
    if (!isActionable(btn)) {
      seenDisabled = true;
      options.onStatus?.('Waiting for quota — Continue not enabled yet…');
      await sleep(intervalMs);
      continue;
    }
    if (seenDisabled) {
      options.onStatus?.('Continue enabled — clicking once…');
    } else {
      options.onStatus?.('Continue ready — clicking…');
    }
    humanClick(btn);
    await sleep(1200);
    const after = doc.location?.href || '';
    if (after !== before) {
      return { clicked: true, detail: 'Navigated after Continue' };
    }
    const payNow = findButtonByLabel(doc, /pay\s*now/i);
    if (payNow) {
      return { clicked: true, detail: 'Reached payment step' };
    }
    return { clicked: true, detail: 'Continue clicked' };
  }
  return { clicked: false, detail: 'Timed out waiting for Continue to enable' };
}

function gatewayPatterns(pref: PaymentGatewayPreference): RegExp[] {
  if (pref === 'ICICI') return [/icici/i];
  if (pref === 'HDFC') return [/hdfc/i];
  if (pref === 'UNION') return [/union\s*bank/i, /union/i];
  return [/icici/i, /hdfc/i, /union/i];
}

export function selectPaymentGateway(doc: Document, pref: PaymentGatewayPreference): { ok: boolean; detail?: string } {
  const patterns = gatewayPatterns(pref);
  const radios = [...doc.querySelectorAll('input[type="radio"]')].filter(
    (r): r is HTMLInputElement => r instanceof HTMLInputElement && isVisible(r)
  );
  if (!radios.length) {
    return { ok: false, detail: 'No payment gateway radios found' };
  }

  for (const pattern of patterns) {
    for (const radio of radios) {
      const row = radio.closest('tr, label, div, li');
      const labelText = row?.textContent || '';
      const id = radio.id;
      const linked = id ? doc.querySelector(`label[for="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`)?.textContent : '';
      const hay = `${labelText} ${linked || ''} ${radio.value || ''}`;
      if (pattern.test(hay)) {
        if (!radio.checked) {
          humanClick(radio);
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return { ok: true, detail: hay.trim().slice(0, 80) };
      }
    }
  }

  const first = radios[0]!;
  if (!first.checked) {
    humanClick(first);
    first.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { ok: true, detail: 'Selected first visible gateway' };
}

export function findPayNowButton(doc: Document): HTMLElement | null {
  return findButtonByLabel(doc, /pay\s*now/i);
}

const BANNER_ID = 'dd-paynow-hint';

export function showPayNowManualBanner(doc: Document, amountHint?: string) {
  doc.getElementById(BANNER_ID)?.remove();
  const pay = findPayNowButton(doc);
  const el = doc.createElement('div');
  el.id = BANNER_ID;
  el.setAttribute('role', 'status');
  el.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483645',
    'max-width:min(92vw,420px)',
    'padding:14px 18px',
    'border-radius:14px',
    'background:linear-gradient(135deg,#1c1917,#3d0a12)',
    'color:#fff',
    'font:600 13px/1.4 system-ui,sans-serif',
    'box-shadow:0 12px 40px rgba(0,0,0,0.35)',
    'border:2px solid #eab308',
    'text-align:center',
  ].join(';');
  el.innerHTML = `<strong style="color:#fde68a">DarshanDesk — ready for payment</strong><br/>
    Review amount${amountHint ? ` (${amountHint})` : ''} and pilgrims, then <strong>click Pay Now yourself</strong> on TTD.`;
  doc.body.appendChild(el);
  if (pay) {
    pay.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

export function hidePayNowManualBanner(doc: Document) {
  doc.getElementById(BANNER_ID)?.remove();
}

async function waitForPhaseChange(doc: Document, from: SrivaniPagePhase, timeoutMs = 20000): Promise<SrivaniPagePhase> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const phase = detectSrivaniPagePhase(doc);
    if (phase !== from && phase !== 'unknown') return phase;
    await sleep(400);
  }
  return detectSrivaniPagePhase(doc);
}

export async function runSrivaniBookingAssist(
  doc: Document,
  options: BookingAssistOptions
): Promise<BookingAssistReport> {
  const steps: BookingAssistReport['steps'] = [];
  const maxWaitMs = options.maxWaitMs ?? 45 * 60 * 1000;
  let phase = detectSrivaniPagePhase(doc);

  if (options.autoContinue) {
    for (let attempt = 0; attempt < 4; attempt++) {
      phase = detectSrivaniPagePhase(doc);
      if (phase === 'payment_gateway' || findPayNowButton(doc)) break;
      if (phase !== 'pilgrim_confirm' && phase !== 'payment_summary' && phase !== 'unknown') break;
      options.onStatus?.(
        attempt === 0
          ? 'Complete CAPTCHA if shown — waiting for Continue to enable…'
          : 'Next step — waiting for Continue…'
      );
      const r = await waitAndClickContinue(doc, {
        maxWaitMs: attempt === 0 ? maxWaitMs : 8 * 60 * 1000,
        onStatus: options.onStatus,
      });
      steps.push({ step: attempt === 0 ? 'continue' : `continue_${attempt + 1}`, ok: r.clicked, detail: r.detail });
      if (!r.clicked) break;
      const next = await waitForPhaseChange(doc, phase);
      if (next === phase) break;
      phase = next;
    }
  }

  phase = detectSrivaniPagePhase(doc);
  let payNowReady = false;

  if (options.autoPaymentGateway && (phase === 'payment_gateway' || findPayNowButton(doc))) {
    options.onStatus?.('Step: selecting payment gateway…');
    const gw = selectPaymentGateway(doc, options.preferredGateway);
    steps.push({ step: 'payment_gateway', ok: gw.ok, detail: gw.detail });
    payNowReady = Boolean(findPayNowButton(doc));
    const amountMatch = (doc.body?.innerText || '').match(/Rs\.?\s*[\d,]+/i);
    showPayNowManualBanner(doc, amountMatch?.[0]);
    steps.push({
      step: 'pay_now_manual',
      ok: payNowReady,
      detail: payNowReady ? 'Pay Now visible — operator must click' : 'Pay Now not found yet',
    });
  } else if (findPayNowButton(doc)) {
    payNowReady = true;
    showPayNowManualBanner(doc);
    steps.push({ step: 'pay_now_manual', ok: true, detail: 'Pay Now visible — operator must click' });
  }

  const success = steps.some((s) => s.ok) || payNowReady;
  return {
    success,
    steps,
    phase,
    payNowReady,
    message: payNowReady
      ? 'Gateway ready — you pay manually on TTD'
      : steps.find((s) => !s.ok)?.detail || 'Assist finished',
  };
}