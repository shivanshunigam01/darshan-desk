console.log("Service worker for Playwright Zoom Extension is loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || request.command !== "setTabZoom") return false;

  const requestId = request.requestId;
  const browserZoom = request.browserZoom;
  const tabId = sender.tab && sender.tab.id;

  if (!Number.isInteger(tabId)) {
    sendResponse({ ok: false, requestId, error: "Zoom request did not originate from a browser tab" });
    return false;
  }
  if (!Number.isInteger(browserZoom) || browserZoom < 25 || browserZoom > 500) {
    sendResponse({ ok: false, requestId, error: "browserZoom must be an integer between 25 and 500" });
    return false;
  }

  chrome.tabs.setZoom(tabId, browserZoom / 100)
    .then(() => chrome.tabs.getZoom(tabId))
    .then((zoomFactor) => {
      sendResponse({ ok: true, requestId, browserZoom: Math.round(zoomFactor * 100) });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        requestId,
        error: error && error.message ? error.message : String(error),
      });
    });

  // The response is asynchronous while the Chrome tabs API resolves.
  return true;
});
