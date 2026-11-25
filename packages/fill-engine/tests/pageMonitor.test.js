import { JSDOM } from 'jsdom';
import {
  buildPageMonitorSnapshot,
  deriveContinueOperatorStatus,
  extractMockQuotaBar,
  observeContinueReadiness,
  readContinueReadiness,
} from '../dist/pageMonitor.js';
import { findContinueButton, isActionable } from '../dist/liveSrivaniAssist.js';

describe('pageMonitor', () => {
  test('extracts mock quota bar fields', () => {
    const dom = new JSDOM(`
      <body data-dd-mapping="mock-srivani-v1">
        <div data-dd-quota="quotaReleaseTime">11:03:00</div>
        <div data-dd-quota="systemTime">10:58:12</div>
        <div data-dd-quota="remainingTime">00:04:48</div>
        <div data-dd-quota="availableQuota">18</div>
        <div data-dd-quota="reportingTime">04:00 PM</div>
        <div data-dd-quota="paymentPending">2</div>
        <div data-dd-quota="successCount">12</div>
      </body>
    `);
    const q = extractMockQuotaBar(dom.window.document);
    expect(q.quotaReleaseTime).toBe('11:03:00');
    expect(q.availableQuota).toBe('18');
    expect(q.successCount).toBe('12');
  });

  test('continue readiness observes enable transition', () => {
    const dom = new JSDOM(`
      <body>
        <button id="cont" disabled style="display:block;width:120px;height:40px">Continue</button>
      </body>
    `);
    const doc = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    global.MutationObserver = dom.window.MutationObserver;
    dom.window.Element.prototype.getBoundingClientRect = function rect() {
      return { width: 120, height: 40, top: 0, left: 0, right: 120, bottom: 40, x: 0, y: 0, toJSON() {} };
    };

    const btn = findContinueButton(doc);
    expect(btn).toBeTruthy();
    expect(isActionable(btn)).toBe(false);

    const states = [];
    const stop = observeContinueReadiness(doc, (s) => states.push(s.readyToContinue));
    expect(states[0]).toBe(false);

    btn.removeAttribute('disabled');
    const ready = readContinueReadiness(doc);
    expect(ready.readyToContinue).toBe(true);
    expect(ready.status).toBe('ready_to_continue');
    expect(ready.statusLabel).toMatch(/Ready to Continue/i);
    stop();
  });

  test('blocks extension assist while mock loading overlay after Continue', () => {
    const dom = new JSDOM(
      `<body><div id="mock-official-loading" style="display:block">Please wait… loading</div><button style="display:block;width:120px;height:40px">Continue</button></body>`
    );
    const doc = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    dom.window.Element.prototype.getBoundingClientRect = () => ({
      width: 120,
      height: 40,
      top: 0,
      left: 0,
      right: 120,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const state = deriveContinueOperatorStatus(doc, 'pilgrim_confirm', { userContinuePending: true });
    expect(state.status).toBe('navigating_loading');
    expect(state.blockExtensionAssist).toBe(true);
  });

  test('buildPageMonitorSnapshot marks mock supported', () => {
    const dom = new JSDOM(`<body data-dd-mapping="mock-srivani-v1"></body>`, {
      url: 'http://localhost:4000/mock-booking/',
    });
    const snap = buildPageMonitorSnapshot(dom.window.document);
    expect(snap.supported).toBe(true);
    expect(snap.source).toBe('mock');
    expect(snap.phase).toBe('mock');
  });
});