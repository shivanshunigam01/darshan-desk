import {
  attachOperatorContinueListener,
  buildPageMonitorSnapshot,
  isMockBookingPage,
  isOfficialTtdHost,
  mergeMonitorWithOutcome,
  observePageMonitor,
  type ContinueMonitorContext,
  type DiagnosticTimelineEvent,
} from '@darshan-desk/fill-engine';

function pageSupported(): boolean {
  if (isMockBookingPage(document)) return true;
  return isOfficialTtdHost(location.hostname);
}

const monitorCtx: ContinueMonitorContext = { userContinuePending: false };
const timeline: DiagnosticTimelineEvent[] = [];

let stopObs: (() => void) | null = null;
let stopContinueListener: (() => void) | null = null;

function publish(snapshot: ReturnType<typeof mergeMonitorWithOutcome>) {
  if (snapshot.phase === 'payment_summary' || snapshot.phase === 'payment_gateway') {
    monitorCtx.userContinuePending = false;
  }
  try {
    void chrome.runtime.sendMessage({ type: 'PAGE_MONITOR_UPDATE', snapshot });
  } catch {
    /* extension context invalidated */
  }
}

function snapshotNow() {
  const base = buildPageMonitorSnapshot(document, location.href, monitorCtx);
  return mergeMonitorWithOutcome(document, base, timeline);
}

function tickPublish() {
  const merged = snapshotNow();
  timeline.length = 0;
  timeline.push(...merged.timeline);
  publish(merged);
}

function getContext() {
  return monitorCtx;
}

function start() {
  if (!pageSupported()) {
    publish(mergeMonitorWithOutcome(document, buildPageMonitorSnapshot(document, location.href), timeline));
    return;
  }
  stopObs?.();
  stopContinueListener?.();
  stopObs = observePageMonitor(document, tickPublish, getContext);
  stopContinueListener = attachOperatorContinueListener(document, () => {
    monitorCtx.userContinuePending = true;
    tickPublish();
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PAGE_MONITOR_REQUEST') {
    const merged = snapshotNow();
    timeline.length = 0;
    timeline.push(...merged.timeline);
    sendResponse({ ok: true, snapshot: merged });
    return;
  }
  if (message?.type === 'GET_DIAGNOSTIC_TIMELINE') {
    sendResponse({ ok: true, timeline: [...timeline] });
    return;
  }
  return false;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

window.addEventListener('pagehide', () => {
  stopObs?.();
  stopContinueListener?.();
  stopObs = null;
  stopContinueListener = null;
  monitorCtx.userContinuePending = false;
  timeline.length = 0;
});