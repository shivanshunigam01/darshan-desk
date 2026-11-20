/*
 * TTD SRIVANI Razorpay checkout helper
 *
 * Run this as a DevTools Snippet while the active tab is on
 * https://tirupatibalaji.ap.gov.in and you are logged in.
 * It reads a JSON payload produced by v2_payment_handoff.py, opens Razorpay
 * Checkout only after a human click, then posts the gateway result to TTD's
 * normal verification endpoint once. It does not save the token/nonce to disk
 * or localStorage, and does not retry payment/verification requests.
 */
(() => {
  'use strict';

  const TTD_ORIGIN = 'https://tirupatibalaji.ap.gov.in';
  const PANEL_ID = 'ttd-rzp-helper-panel';
  const SDK_URL = 'https://checkout.razorpay.com/v1/checkout.js';

  if (location.origin !== TTD_ORIGIN) {
    alert('Open the TTD portal first, then run this snippet in that tab.');
    return;
  }

  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.remove();
  }

  const panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.style.cssText = [
    'position:fixed!important', 'right:14px!important', 'bottom:14px!important',
    'z-index:2147483647!important', 'width:390px!important', 'max-width:calc(100vw - 28px)!important',
    'padding:14px!important', 'background:#fff!important', 'color:#161616!important',
    'border:1px solid #aaa!important', 'border-radius:10px!important',
    'box-shadow:0 4px 22px rgba(0,0,0,.25)!important',
    'font:13px/1.4 system-ui,sans-serif!important', 'text-align:left!important'
  ].join(';');

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px';
  const title = document.createElement('strong');
  title.textContent = 'TTD Razorpay checkout';
  title.style.cssText = 'font-size:15px;color:#111';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close helper';
  closeBtn.style.cssText = 'border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#444;padding:0 4px';
  closeBtn.addEventListener('click', () => panel.remove());
  titleRow.append(title, closeBtn);

  const instructions = document.createElement('p');
  instructions.textContent = 'Paste the full JSON from razorpay_checkout_payload.json. Check the amount and order details before opening checkout.';
  instructions.style.cssText = 'margin:0 0 8px;color:#333';

  const input = document.createElement('textarea');
  input.id = 'ttd-rzp-helper-payload';
  input.rows = 7;
  input.spellcheck = false;
  input.autocapitalize = 'off';
  input.autocomplete = 'off';
  input.placeholder = '{ "token": "…", "nonce": "…", "orderId": "order_…", "keyId": "rzp_live_…", "paymentParams": { "orderId": "DNI…", ... } }';
  input.style.cssText = 'display:block!important;width:100%!important;box-sizing:border-box!important;resize:vertical!important;padding:8px!important;border:1px solid #888!important;border-radius:6px!important;background:#fff!important;color:#111!important;font:11px/1.35 ui-monospace,monospace!important;margin:0 0 8px!important;white-space:pre!important';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.textContent = 'Validate & open Razorpay';
  openBtn.style.cssText = 'display:block!important;width:100%!important;padding:9px 10px!important;border:0!important;border-radius:6px!important;background:#1459c7!important;color:#fff!important;font-weight:600!important;cursor:pointer!important';

  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Loading Razorpay Checkout…';
  status.style.cssText = 'margin-top:8px;color:#333;overflow-wrap:anywhere;min-height:18px';

  const note = document.createElement('p');
  note.textContent = 'This helper sends payment details only to TTD’s same-origin verification endpoint. Never share this payload; it contains session credentials.';
  note.style.cssText = 'margin:8px 0 0;color:#6b2525;font-size:11px';

  panel.append(titleRow, instructions, input, openBtn, status, note);
  document.body.appendChild(panel);

  let sdkReady = Boolean(window.Razorpay);
  let sdkFailed = false;
  let checkoutStarted = false;
  let verificationStarted = false;
  openBtn.disabled = true;
  openBtn.style.opacity = '0.6';

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? '#a31515' : '#333';
  }

  function setButtonReady(ready) {
    openBtn.disabled = !ready;
    openBtn.style.opacity = ready ? '1' : '0.6';
    openBtn.style.cursor = ready ? 'pointer' : 'not-allowed';
  }

  function loadSdk() {
    if (window.Razorpay) {
      sdkReady = true;
      setButtonReady(true);
      setStatus('Ready. Paste the payload, then click the button.');
      return;
    }

    let script = document.querySelector('script[data-ttd-rzp-helper-sdk="1"]');
    if (!script) {
      script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.dataset.ttdRzpHelperSdk = '1';
      script.onload = () => {
        if (window.Razorpay) {
          sdkReady = true;
          setButtonReady(true);
          setStatus('Razorpay loaded. Paste the payload, then click the button.');
        } else {
          sdkFailed = true;
          setStatus('The SDK loaded but window.Razorpay is unavailable. Reload the TTD page and try again.', true);
        }
      };
      script.onerror = () => {
        sdkFailed = true;
        setStatus('Could not load Razorpay Checkout. Check the connection, then rerun the snippet.', true);
      };
      (document.head || document.body).appendChild(script);
    } else {
      script.addEventListener('load', () => {
        sdkReady = Boolean(window.Razorpay);
        setButtonReady(sdkReady);
        setStatus(sdkReady ? 'Razorpay loaded. Paste the payload, then click the button.' : 'Razorpay SDK is not ready.', !sdkReady);
      }, { once: true });
    }
  }

  function parsePayload() {
    let data;
    try {
      data = JSON.parse(input.value.trim());
    } catch (error) {
      throw new Error('That is not valid JSON. Paste the entire payload file contents.');
    }
    if (!data || typeof data !== 'object') throw new Error('Payload must be a JSON object.');
    for (const field of ['token', 'nonce', 'orderId', 'keyId']) {
      if (typeof data[field] !== 'string' || !data[field].trim()) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    if (!data.paymentParams || typeof data.paymentParams !== 'object') {
      throw new Error('Missing paymentParams object.');
    }
    if (typeof data.paymentParams.orderId !== 'string' || !data.paymentParams.orderId.trim()) {
      throw new Error('paymentParams.orderId (the TTD booking order ID) is missing.');
    }
    if (String(data.paymentParams.orderId) === String(data.orderId)) {
      throw new Error('The TTD booking order ID and Razorpay order ID should be distinct. Check the payload.');
    }
    if (!Number.isFinite(Number(data.paymentParams.amount)) || Number(data.paymentParams.amount) <= 0) {
      throw new Error('paymentParams.amount is missing or invalid.');
    }
    if (!data.paymentParams.pgId || !data.paymentParams.currency) {
      throw new Error('paymentParams.pgId or paymentParams.currency is missing.');
    }
    return data;
  }

  function getAngularServices() {
    const ng = window.angular;
    if (!ng) return null;
    const candidate = document.querySelector('[ng-app]') || document.getElementById('container') || document.documentElement;
    try {
      const element = ng.element(candidate);
      const injector = element.injector && element.injector();
      if (!injector) return null;
      return { injector, location: injector.get('$location'), rootScope: injector.get('$rootScope') };
    } catch (_) {
      return null;
    }
  }

  async function verifyWithTTD(payload, razorResponse) {
    if (verificationStarted) return;
    verificationStarted = true;
    const requestBody = {
      ...payload.paymentParams,
      razorpay_payment_id: razorResponse.razorpay_payment_id,
      razorpay_signature: razorResponse.razorpay_signature,
      razorpay_order_id: razorResponse.razorpay_order_id
    };

    setStatus('Razorpay reported success. Sending the result to TTD for verification…');
    try {
      const response = await fetch('/wlpgpayment/getPaymentResponseRazor', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'ttd-auth-token': payload.token,
          'X-Payment-Nonce': payload.nonce
        },
        body: JSON.stringify(requestBody)
      });

      const raw = await response.text();
      let result;
      try { result = JSON.parse(raw); } catch (_) {
        throw new Error(`TTD verification returned a non-JSON response (HTTP ${response.status}). Do not retry payment automatically.`);
      }
      if (!response.ok) {
        throw new Error(`TTD verification returned HTTP ${response.status}: ${result.message || result.error || 'request rejected'}. Check transaction status before any retry.`);
      }

      if (result && result.status === 'SUCCESS' && result.redirectUrl) {
        setStatus('TTD verified the payment. Opening the TTD confirmation page…');
        const marker = result.redirectUrl.indexOf('#');
        const route = decodeURIComponent(marker >= 0 ? result.redirectUrl.substring(marker + 1) : result.redirectUrl);
        const angularServices = getAngularServices();
        if (angularServices && route) {
          const applyRoute = () => angularServices.location.path(route);
          if (angularServices.rootScope.$$phase) applyRoute();
          else angularServices.rootScope.$apply(applyRoute);
        } else if (route) {
          // Fallback for the normal AngularJS hash-route setup.
          location.hash = route.startsWith('/') ? `#${route}` : `#/${route}`;
        }
        setStatus('TTD verification returned SUCCESS. Confirm the booking on the TTD page.');
      } else if (result && result.status === 'FAILED' && result.redirectUrl) {
        setStatus('TTD returned FAILED for this payment. Opening the returned TTD route; check the displayed status.', true);
        const marker = result.redirectUrl.indexOf('#');
        const route = decodeURIComponent(marker >= 0 ? result.redirectUrl.substring(marker + 1) : result.redirectUrl);
        const angularServices = getAngularServices();
        if (angularServices && route) {
          const applyRoute = () => angularServices.location.path(route);
          if (angularServices.rootScope.$$phase) applyRoute();
          else angularServices.rootScope.$apply(applyRoute);
        } else if (route) {
          location.hash = route.startsWith('/') ? `#${route}` : `#/${route}`;
        }
      } else {
        setStatus(`TTD received the payment callback but did not return SUCCESS. Response status: ${String(result?.status ?? 'unknown')}. Check TTD booking/payment status before another attempt.`, true);
      }
    } catch (error) {
      console.error('[TTD Razorpay helper] Verification status:', error.message);
      setStatus(`Could not confirm TTD verification: ${error.message}`, true);
    }
  }

  openBtn.addEventListener('click', () => {
    if (checkoutStarted) {
      setStatus('Checkout has already been opened by this helper. Check its status before attempting anything else.', true);
      return;
    }
    if (!sdkReady || !window.Razorpay || sdkFailed) {
      setStatus('Razorpay is not ready yet. Wait for the SDK to finish loading.', true);
      return;
    }

    let payload;
    try {
      payload = parsePayload();
    } catch (error) {
      setStatus(error.message, true);
      return;
    }

    const amount = Number(payload.paymentParams.amount);
    const confirmed = window.confirm(
      `Open Razorpay Checkout?\n\nAmount: ₹${amount.toLocaleString('en-IN')}\n` +
      `TTD booking ID: ${payload.paymentParams.orderId}\nRazorpay order ID: ${payload.orderId}\n\n` +
      'Only continue if these details match your booking.'
    );
    if (!confirmed) return;

    checkoutStarted = true;
    setButtonReady(false);
    input.value = ''; // remove credentials from visible UI; in-memory closure is still needed for verification
    setStatus('Opening Razorpay Checkout…');

    try {
      // TTD's paymentParams.amount is in rupees; Razorpay Checkout expects
      // the amount in the smallest currency unit (paise for INR).
      const amountInPaise = Math.round(Number(payload.paymentParams.amount) * 100);
      if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
        throw new Error('The checkout amount is invalid. Do not continue.');
      }
      const checkout = new window.Razorpay({
        key: payload.keyId,
        amount: amountInPaise,
        currency: payload.paymentParams.currency || 'INR',
        name: 'TTD',
        description: 'SRIVANI booking payment',
        order_id: payload.orderId,
        handler: (response) => verifyWithTTD(payload, response),
        modal: {
          ondismiss: () => setStatus('Checkout was dismissed. Check TTD/Razorpay status before attempting payment again.', true)
        },
        prefill: {
          name: `${payload.paymentParams.firstName || ''} ${payload.paymentParams.lastName || ''}`.trim(),
          email: payload.paymentParams.email || '',
          contact: payload.paymentParams.mobileNumber || ''
        },
        notes: { bookingId: payload.paymentParams.orderId },
        theme: { color: '#3399cc' }
      });
      checkout.on('payment.failed', (event) => {
        const message = event?.error?.description || 'Razorpay reported a payment failure.';
        setStatus(`${message} Check the order/payment status before retrying.`, true);
      });
      checkout.open();
    } catch (error) {
      setStatus(`Could not open Razorpay: ${error.message}. Check the payment state before trying again.`, true);
    }
  });

  loadSdk();
  console.info('[TTD Razorpay helper] Ready on TTD origin. Paste the generated payload into the panel; payload values are not logged.');
})();
