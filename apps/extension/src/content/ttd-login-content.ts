import type { PortalCredentials } from '../shared/portalCredentials';
import { hideFillOverlay, showFillOverlay } from './fill-overlay';

type FillReport = {
  ok: boolean;
  loginId?: boolean;
  password?: boolean;
  message?: string;
  error?: string;
};

function dispatchInput(el: HTMLElement) {
  const view = el.ownerDocument.defaultView;
  if (!view) return;
  el.dispatchEvent(new view.Event('input', { bubbles: true }));
  el.dispatchEvent(new view.Event('change', { bubbles: true }));
  el.dispatchEvent(new view.Event('blur', { bubbles: true }));
}

function setValue(el: HTMLInputElement, value: string) {
  el.focus();
  el.value = value;
  dispatchInput(el);
}

function findEmailInput(doc: Document): HTMLInputElement | null {
  const selectors = [
    'input[type="email"]',
    'input[name="email" i]',
    'input[name="username" i]',
    'input[name="userName" i]',
    'input[formcontrolname="email" i]',
    'input[formcontrolname="userName" i]',
    'input[placeholder*="mail" i]',
    'input[placeholder*="mobile" i]',
    'input[placeholder*="user" i]',
  ];
  for (const s of selectors) {
    const el = doc.querySelector(s);
    if (el instanceof HTMLInputElement && el.type !== 'password') return el;
  }
  const password = doc.querySelector('input[type="password"]');
  const scope = password?.closest('form') ?? password?.closest('.login, .card, div') ?? doc.body;
  const inputs = [...scope.querySelectorAll('input')].filter(
    (i) => i instanceof HTMLInputElement && !['password', 'hidden', 'submit', 'button', 'checkbox', 'radio'].includes(i.type)
  );
  return (inputs[0] as HTMLInputElement) ?? null;
}

function findPasswordInput(doc: Document): HTMLInputElement | null {
  return doc.querySelector('input[type="password"]');
}

function isLoginFormVisible(doc: Document): boolean {
  return Boolean(findPasswordInput(doc) && findEmailInput(doc));
}

function fillLogin(credentials: PortalCredentials): FillReport {
  const report: FillReport = { ok: false };
  const email = findEmailInput(document);
  const password = findPasswordInput(document);

  if (email && credentials.loginId) {
    setValue(email, credentials.loginId);
    report.loginId = true;
  }
  if (password && credentials.password) {
    setValue(password, credentials.password);
    report.password = true;
  }

  report.ok = Boolean(report.loginId && report.password);
  if (report.ok) {
    report.message = 'Login and password filled — enter captcha yourself, then press Login on TTD.';
  }
  return report;
}

function injectAssistButton() {
  if (document.getElementById('dd-ttd-login-assist')) return;
  if (!isLoginFormVisible(document)) return;

  const btn = document.createElement('button');
  btn.id = 'dd-ttd-login-assist';
  btn.type = 'button';
  btn.textContent = 'Use DarshanDesk login';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: '2147483646',
    padding: '10px 14px',
    borderRadius: '8px',
    border: 'none',
    background: '#7c2d12',
    color: '#fff',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,.25)',
  });
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TTD_LOGIN_FILL_FROM_PAGE' }).catch(() => {});
  });
  document.body.appendChild(btn);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'TTD_LOGIN_FILL') {
    if (!isLoginFormVisible(document)) {
      sendResponse({ ok: false, error: 'TTD login form not found on this page — open the Login screen first.' });
      return;
    }
    showFillOverlay(document, 'Filling login and password…', 'DarshanDesk login');
    try {
      sendResponse(fillLogin(message.credentials as PortalCredentials));
    } finally {
      hideFillOverlay(document);
    }
    return;
  }
  if (message?.type === 'TTD_LOGIN_PAGE_STATUS') {
    sendResponse({ ok: true, loginForm: isLoginFormVisible(document), url: location.href });
    return;
  }
  return false;
});

const obs = new MutationObserver(() => {
  injectAssistButton();
});
obs.observe(document.documentElement, { childList: true, subtree: true });
void injectAssistButton();