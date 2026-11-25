import { JSDOM } from 'jsdom';
import { appendTimelineEvent, assessPageOutcome, mergeMonitorWithOutcome } from '../dist/bookingDiagnostics.js';
import { buildPageMonitorSnapshot as buildBase } from '../dist/pageMonitor.js';

describe('bookingDiagnostics', () => {
  test('quota exceeded on mock page yields QUOTA_REJECTED timeline', () => {
    const dom = new JSDOM(
      `
      <body data-dd-mapping="mock-srivani-v1" data-dd-active-step="payment-summary">
        <div data-dd-quota="availableQuota">183</div>
        <p>Cannot book as quota exceeded</p>
      </body>
    `,
      { url: 'http://localhost:4000/mock-booking/' }
    );
    global.HTMLElement = dom.window.HTMLElement;
    const doc = dom.window.document;
    const base = buildBase(doc);
    const merged = mergeMonitorWithOutcome(doc, base, []);
    expect(merged.outcomeCode).toBe('QUOTA_REJECTED');
    expect(merged.officialMessage).toContain('Cannot book as quota exceeded');
    expect(merged.timeline.length).toBeGreaterThan(0);
    expect(merged.blockAutoResubmit).toBe(true);
  });

  test('appendTimelineEvent deduplicates identical events', () => {
    const e = {
      atUtc: '2025-01-01T00:00:00.000Z',
      bookingStage: 'pilgrim_details',
      pageRoute: 'http://x',
      quotaSnapshot: {},
      continueReadiness: {
        status: 'waiting_for_continue',
        readyToContinue: false,
        loadingOverlay: false,
        buttonEnabled: false,
        blockExtensionAssist: false,
      },
      sanitizedError: null,
      outcomeCode: null,
      confirmationStatus: 'none',
    };
    let t = [];
    t = appendTimelineEvent(t, e);
    t = appendTimelineEvent(t, e);
    expect(t.length).toBe(1);
  });

  test('HTTP 200 booking-stage JSON error fixture => QUOTA_REJECTED', () => {
    const dom = new JSDOM(
      `
      <body data-dd-mapping="mock-srivani-v1" data-dd-booking-stage-response='{"endpoint":"/dms/srivaniCurrentDayDarshanBooking","httpStatus":200,"body":{"error":"Cannot book as quota exceeded"}}'>
        <div data-dd-quota="availableQuota">183</div>
      </body>
    `,
      { url: 'http://localhost:4000/mock-booking/' }
    );
    global.HTMLElement = dom.window.HTMLElement;
    const merged = mergeMonitorWithOutcome(dom.window.document, buildBase(dom.window.document), []);
    expect(merged.workflowStatus).toBe('QUOTA_REJECTED');
    expect(merged.outcomeCode).toBe('QUOTA_REJECTED');
    expect(merged.bookingStageHttp?.httpOkButRejected).toBe(true);
    expect(merged.blockPaymentReady).toBe(true);
    expect(merged.blockBookingConfirmed).toBe(true);
  });

  test('assessPageOutcome notice mentions quota observation', () => {
    const dom = new JSDOM(`<body><p>Cannot book as quota exceeded</p></body>`);
    const base = buildBase(dom.window.document);
    const o = assessPageOutcome(dom.window.document, base);
    expect(o.diagnosticNotices.some((n) => /does not guarantee allocation/i.test(n))).toBe(true);
  });
});