import { validateValue } from './profile.js';
import type { FieldDefinition, FieldFillResult, FillPlanItem } from './types.js';

function genderCandidates(g: string): string[] {
  const u = g.trim().toUpperCase();
  if (u === 'M' || u === 'MALE') return ['M', 'Male', 'MALE'];
  if (u === 'F' || u === 'FEMALE') return ['F', 'Female', 'FEMALE'];
  if (u === 'O' || u === 'T' || u === 'OTHER' || u === 'TRANSGENDER') return ['O', 'T', 'Other', 'Transgender', 'TRANSGENDER'];
  return [g];
}

function idTypeCandidates(t: string): string[] {
  const n = t.trim().toLowerCase();
  if (n.includes('aadhaar') || n.includes('aadhar')) return ['Aadhaar', 'Aadhaar Card', 'AADHAAR'];
  if (n.includes('passport')) return ['Passport', 'PASSPORT'];
  if (n === 'pan') return ['PAN', 'Pan Card'];
  return [t];
}

function pickSelectOptionValue(select: HTMLSelectElement, candidates: string[]): { applied: string | null; reason?: string } {
  const opts = Array.from(select.options).filter((o) => o.value !== '' || o.text.trim() !== '');
  for (const candidate of candidates) {
    const exact = opts.find((o) => o.value === candidate);
    if (exact) return { applied: exact.value };
    const byText = opts.find((o) => o.text.trim().toLowerCase() === candidate.toLowerCase());
    if (byText) return { applied: byText.value };
    const contains = opts.find((o) => o.text.toLowerCase().includes(candidate.toLowerCase()));
    if (contains) return { applied: contains.value };
  }
  const available = opts.map((o) => `${o.value || '(empty)'}:${o.text}`).join(', ');
  return { applied: null, reason: `No matching dropdown option — available: ${available || 'none'}` };
}

export function detectCaptchaRequired(doc: Document): boolean {
  const el = doc.querySelector('[data-dd-captcha], [data-dd-field="captcha-required"]');
  if (!el || !(el instanceof HTMLElement)) return false;
  return isVisible(el);
}

export interface DomFillOptions {
  allowOverwrite: boolean;
  duplicateSessionKey: string;
}

export function resolveElement(doc: Document, strategy: FieldDefinition['selectorStrategy']): Element | null {
  if (strategy.kind === 'data-attribute') {
    return doc.querySelector(`[data-dd-field="${strategy.value}"]`);
  }
  if (strategy.kind === 'id') {
    return doc.getElementById(strategy.value);
  }
  return doc.querySelector(`[name="${strategy.value}"]`);
}

export function waitForDomReady(doc: Document, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error('DOM not ready within timeout')), timeoutMs);
    doc.addEventListener(
      'DOMContentLoaded',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/** Fill visible permitted inputs using native events for React/Angular controlled components. */
export function executeFillPlan(
  doc: Document,
  plan: FillPlanItem[],
  options: DomFillOptions
): FieldFillResult[] {
  const duplicateFlag = `dd-filled:${options.duplicateSessionKey}`;
  if (doc.documentElement.getAttribute('data-dd-session') === duplicateFlag) {
    return plan.map((item) => ({
      key: item.definition.key,
      displayLabel: item.definition.displayLabel,
      status: 'skipped_duplicate',
      message: 'This page was already filled in the current extension session',
    }));
  }

  const results: FieldFillResult[] = [];

  for (const item of plan) {
  const def = item.definition;
    if (def.sourceProfileField === '_skip') {
      results.push({
        key: def.key,
        displayLabel: def.displayLabel,
        status: 'skipped_declined',
        message: 'Legal/consent fields are never auto-filled',
      });
      continue;
    }

    const validationError = validateValue(item.value, def.validationSchema);
    if (validationError) {
      results.push({
        key: def.key,
        displayLabel: def.displayLabel,
        status: 'validation_failed',
        expected: item.value,
        message: validationError,
      });
      continue;
    }

    const el = resolveElement(doc, def.selectorStrategy);
    if (!el || !(el instanceof HTMLElement)) {
      results.push({
        key: def.key,
        displayLabel: def.displayLabel,
        status: 'missing_element',
        expected: item.value,
        message: 'Target input not found or not visible',
      });
      continue;
    }

    if (!isVisible(el)) {
      results.push({
        key: def.key,
        displayLabel: def.displayLabel,
        status: 'missing_element',
        expected: item.value,
        message: 'Input exists but is not visible',
      });
      continue;
    }

    const current = readElementValue(el);
    if (current && normalizeCompare(current) !== normalizeCompare(item.value)) {
      if (!options.allowOverwrite) {
        results.push({
          key: def.key,
          displayLabel: def.displayLabel,
          status: 'needs_confirmation',
          expected: item.value,
          actual: current,
          message: 'Existing value differs — enable overwrite in popup to replace',
        });
        continue;
      }
    }

    const applied = applyValueToControl(el, def.supportedFieldType, item.value, def.key);
    if (!applied.ok) {
      results.push({
        key: def.key,
        displayLabel: def.displayLabel,
        status: def.supportedFieldType === 'Dropdown' ? 'dropdown_unknown_option' : 'validation_failed',
        expected: item.value,
        message: applied.reason || 'Could not apply value',
      });
      continue;
    }
    const after = readElementValue(el);
    const expectedNorm = normalizeCompare(applied.applied || item.value);
    const verified = normalizeCompare(after) === expectedNorm;

    results.push({
      key: def.key,
      displayLabel: def.displayLabel,
      status: verified ? 'verified' : 'validation_failed',
      expected: item.value,
      actual: after,
      message: verified ? 'Filled and verified' : 'Filled but verification mismatch',
    });
  }

  const anyFilled = results.some((r) => r.status === 'filled' || r.status === 'verified');
  if (anyFilled) doc.documentElement.setAttribute('data-dd-session', duplicateFlag);

  return results;
}

export function isVisible(el: HTMLElement): boolean {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function readElementValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? el.value || 'on' : '';
    return el.value;
  }
  if (el instanceof HTMLSelectElement) return el.value;
  if (el instanceof HTMLTextAreaElement) return el.value;
  return (el as HTMLElement).getAttribute('value') || '';
}

export function applyValueToControl(
  el: HTMLElement,
  type: FieldDefinition['supportedFieldType'],
  value: string,
  fieldKey?: string
): { ok: boolean; reason?: string; applied?: string } {
  if (el instanceof HTMLSelectElement) {
    const candidates =
      fieldKey?.includes('gender') || type === 'Dropdown' && el.getAttribute('data-dd-field')?.includes('gender')
        ? genderCandidates(value)
        : fieldKey?.includes('idType') || el.getAttribute('data-dd-field')?.includes('idType')
          ? idTypeCandidates(value)
          : [value];
    const pick = pickSelectOptionValue(el, candidates.length ? candidates : [value]);
    if (!pick.applied) return { ok: false, reason: pick.reason };
    el.value = pick.applied;
    dispatchInput(el);
    return { ok: true, applied: pick.applied };
  }
  if (el instanceof HTMLInputElement) {
    if (type === 'Radio') {
      const group = el.ownerDocument.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][data-dd-field="${el.getAttribute('data-dd-field')}"]`
      );
      let hit = false;
      group.forEach((radio) => {
        if (radio.value === value) {
          radio.checked = true;
          dispatchInput(radio);
          hit = true;
        }
      });
      if (!hit && el.type === 'radio') {
        el.checked = el.value === value;
        dispatchInput(el);
        hit = el.checked;
      }
      return { ok: hit };
    }
    if (el.type === 'checkbox') return { ok: false, reason: 'Checkbox not auto-filled' };
    el.value = value;
    dispatchInput(el);
    return { ok: true, applied: value };
  }
  if (el instanceof HTMLTextAreaElement) {
    el.value = value;
    dispatchInput(el);
    return { ok: true, applied: value };
  }
  return { ok: false, reason: 'Unsupported element' };
}

function dispatchInput(el: HTMLElement) {
  const view = el.ownerDocument.defaultView;
  if (!view) return;
  el.dispatchEvent(new view.Event('input', { bubbles: true }));
  el.dispatchEvent(new view.Event('change', { bubbles: true }));
}

function normalizeCompare(v: string): string {
  return v.trim().toLowerCase();
}