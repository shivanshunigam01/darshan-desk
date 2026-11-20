window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;

  const message = event.data;
  if (!message || message.type !== "setTabZoom") return;
  if (typeof message.requestId !== "string" || !message.requestId) return;

  const requestId = message.requestId;
  const browserZoom = message.browserZoom;
  const reply = (result) => {
    window.postMessage(
      { type: "tabZoomResult", requestId, ...result },
      window.location.origin
    );
  };

  if (!Number.isInteger(browserZoom) || browserZoom < 25 || browserZoom > 500) {
    reply({ ok: false, error: "browserZoom must be an integer between 25 and 500" });
    return;
  }

  chrome.runtime.sendMessage(
    { command: "setTabZoom", requestId, browserZoom },
    (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reply({ ok: false, error: runtimeError.message || "Extension messaging failed" });
        return;
      }
      if (!response || response.ok !== true) {
        reply({ ok: false, error: response?.error || "Zoom service worker did not confirm success" });
        return;
      }
      reply({ ok: true, browserZoom: response.browserZoom });
    }
  );
});
