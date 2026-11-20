const ROOT_ID = 'dd-fill-overlay-root';

const STYLES = `
  #${ROOT_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(28, 25, 23, 0.35);
    backdrop-filter: blur(2px);
    font-family: 'DM Sans', system-ui, sans-serif;
    pointer-events: none;
  }
  #${ROOT_ID} .dd-fill-card {
    pointer-events: auto;
    min-width: 220px;
    max-width: min(92vw, 320px);
    padding: 18px 22px;
    border-radius: 12px;
    background: #fffbeb;
    border: 1px solid #fed7aa;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
    text-align: center;
    color: #1c1917;
  }
  #${ROOT_ID} .dd-fill-spinner {
    width: 32px;
    height: 32px;
    margin: 0 auto 12px;
    border: 3px solid #e7e5e4;
    border-top-color: #b45309;
    border-radius: 50%;
    animation: dd-fill-spin 0.75s linear infinite;
  }
  #${ROOT_ID} .dd-fill-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }
  #${ROOT_ID} .dd-fill-status {
    margin: 6px 0 0;
    font-size: 12px;
    color: #57534e;
    line-height: 1.35;
  }
  @keyframes dd-fill-spin {
    to { transform: rotate(360deg); }
  }
`;

let styleEl: HTMLStyleElement | null = null;

function ensureStyles(doc: Document) {
  if (styleEl?.isConnected) return;
  styleEl = doc.createElement('style');
  styleEl.textContent = STYLES;
  doc.documentElement.appendChild(styleEl);
}

export function showFillOverlay(doc: Document, status: string, title = 'DarshanDesk autofill') {
  hideFillOverlay(doc);
  ensureStyles(doc);
  const root = doc.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <div class="dd-fill-card">
      <div class="dd-fill-spinner" aria-hidden="true"></div>
      <p class="dd-fill-title">${title}</p>
      <p class="dd-fill-status" data-dd-status></p>
    </div>
  `;
  const statusEl = root.querySelector('[data-dd-status]');
  if (statusEl) statusEl.textContent = status;
  doc.body.appendChild(root);
}

export function updateFillOverlayStatus(doc: Document, status: string) {
  const el = doc.querySelector(`#${ROOT_ID} [data-dd-status]`);
  if (el) el.textContent = status;
}

export function hideFillOverlay(doc: Document) {
  doc.getElementById(ROOT_ID)?.remove();
}