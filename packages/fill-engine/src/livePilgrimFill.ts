import { applyValueToControl, isVisible } from './domFill.js';
import type { FieldFillResult, PilgrimProfile } from './types.js';

export function isLiveSrivaniPilgrimPage(doc: Document, href = ''): boolean {
  if (!/tirupatibalaji\.ap\.gov\.in/i.test(doc.location?.hostname || '')) return false;
  const hay = `${href || doc.location?.href || ''} ${doc.body?.innerText?.slice(0, 8000) || ''}`;
  if (!/pilgrim details/i.test(hay)) return false;
  return /edonationConfirm|srivani|break darshan/i.test(hay);
}

export function findLivePilgrimRows(doc: Document): HTMLElement[] {
  for (const table of doc.querySelectorAll('table')) {
    const text = table.textContent || '';
    if (!/name/i.test(text) || !/gender/i.test(text)) continue;
    const rows = [...table.querySelectorAll('tr')].filter((tr) => {
      const controls = tr.querySelectorAll('input, select, textarea');
      return controls.length >= 3;
    });
    if (rows.length) return rows as HTMLElement[];
  }
  const ngRows = [...doc.querySelectorAll('tr[ng-repeat], tr[data-ng-repeat], div[ng-repeat], div[data-ng-repeat]')].filter(
    (el) => el.querySelector('input, select')
  );
  return ngRows as HTMLElement[];
}

export function countLivePilgrimRows(doc: Document): number {
  return findLivePilgrimRows(doc).length;
}

function rowControls(row: HTMLElement) {
  const inputs = [...row.querySelectorAll('input')].filter(
    (i) => i instanceof HTMLInputElement && !['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(i.type)
  ) as HTMLInputElement[];
  const selects = [...row.querySelectorAll('select')] as HTMLSelectElement[];
  const textLike = inputs.filter((i) => i.type === 'text' || i.type === '' || !i.type);
  const numberLike = inputs.find((i) => i.type === 'number') || inputs.find((i) => /age/i.test(i.name || i.id || ''));
  return {
    name: textLike[0],
    age: numberLike || inputs[1],
    gender: selects[0],
    idType: selects[1] ?? selects[0],
    idNumber: textLike.length > 1 ? textLike[textLike.length - 1] : inputs[inputs.length - 1],
  };
}

function fillOne(
  el: HTMLElement | undefined,
  type: 'Text' | 'Number' | 'Dropdown',
  value: string,
  key: string,
  label: string,
  allowOverwrite: boolean
): FieldFillResult {
  if (!el) {
    return { key, displayLabel: label, status: 'missing_element', expected: value, message: 'Control not found in row' };
  }
  if (!isVisible(el)) {
    return { key, displayLabel: label, status: 'missing_element', expected: value, message: 'Control hidden' };
  }
  const current =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? el.value
      : el instanceof HTMLSelectElement
        ? el.value
        : '';
  if (current.trim() && current.trim().toLowerCase() !== value.trim().toLowerCase() && !allowOverwrite) {
    return {
      key,
      displayLabel: label,
      status: 'needs_confirmation',
      expected: value,
      actual: current,
      message: 'Value differs — enable overwrite',
    };
  }
  const applied = applyValueToControl(el, type, value, key);
  if (!applied.ok) {
    return { key, displayLabel: label, status: 'validation_failed', expected: value, message: applied.reason || 'Apply failed' };
  }
  return { key, displayLabel: label, status: 'verified', expected: value, actual: applied.applied || value, message: 'Filled' };
}

export function fillLiveSrivaniPilgrims(
  doc: Document,
  pilgrims: PilgrimProfile[],
  options: { allowOverwrite: boolean; onProgress?: (message: string) => void }
): FieldFillResult[] {
  const rows = findLivePilgrimRows(doc);
  if (!rows.length) {
    return [
      {
        key: 'live_rows',
        displayLabel: 'Pilgrim table',
        status: 'missing_element',
        message: 'Pilgrim table not found — open the Pilgrim Details step',
      },
    ];
  }
  const results: FieldFillResult[] = [];
  const count = Math.min(pilgrims.length, rows.length);
  for (let i = 0; i < count; i++) {
    options.onProgress?.(`Filling pilgrim ${i + 1} of ${count}…`);
    const p = pilgrims[i]!;
    const c = rowControls(rows[i]!);
    const prefix = `p${i}`;
    results.push(fillOne(c.name, 'Text', p.fullName, `${prefix}_fullName`, `Pilgrim ${i + 1} name`, options.allowOverwrite));
    results.push(fillOne(c.age, 'Number', String(p.age), `${prefix}_age`, `Pilgrim ${i + 1} age`, options.allowOverwrite));
    if (c.gender && c.idType && c.gender === c.idType) {
      results.push(fillOne(c.gender, 'Dropdown', p.gender, `${prefix}_gender`, `Pilgrim ${i + 1} gender`, options.allowOverwrite));
    } else {
      results.push(fillOne(c.gender, 'Dropdown', p.gender, `${prefix}_gender`, `Pilgrim ${i + 1} gender`, options.allowOverwrite));
      results.push(fillOne(c.idType, 'Dropdown', p.idType, `${prefix}_idType`, `Pilgrim ${i + 1} ID type`, options.allowOverwrite));
    }
    results.push(
      fillOne(c.idNumber, 'Text', p.idNumber, `${prefix}_idNumber`, `Pilgrim ${i + 1} ID number`, options.allowOverwrite)
    );
  }
  if (pilgrims.length > rows.length) {
    results.push({
      key: 'row_count',
      displayLabel: 'Row count',
      status: 'validation_failed',
      message: `Page has ${rows.length} row(s) but ${pilgrims.length} selected`,
    });
  }
  return results;
}