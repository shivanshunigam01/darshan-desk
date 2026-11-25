const MIN_DONATION = 10000;
const params = new URLSearchParams(location.search);
const pilgrimSlots = Math.min(9, Math.max(1, Number(params.get('pilgrims') || 4)));

const state = {
  step: 'quota',
  bookingCategory: 'CURRENT',
  donation: '',
  preferredDate: '',
  pilgrims: Array.from({ length: pilgrimSlots }, () => ({
    fullName: '',
    age: '',
    gender: '',
    dateOfBirth: '',
    idType: '',
    idNumber: '',
    mobile: '',
    city: '',
  })),
};

function setStep(step) {
  state.step = step;
  document.body.setAttribute('data-dd-active-step', step);
  render();
}

function bindControlled(el, get, set) {
  if (!el) return;
  el.value = get();
  el.addEventListener('input', () => set(el.value));
  el.addEventListener('change', () => set(el.value));
}

function showMockOfficialLoading(done) {
  const el = document.createElement('div');
  el.id = 'mock-official-loading';
  el.className = 'mock-loading-overlay';
  el.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);color:#fff;display:flex;align-items:center;justify-content:center;z-index:9999;font:600 16px system-ui,sans-serif';
  el.textContent = 'Please wait… loading';
  document.body.appendChild(el);
  setTimeout(() => {
    el.remove();
    done();
  }, 1400);
}

function quotaStatusHtml(quota, { systemId = 'mock-system-time', remainId = 'mock-remaining-time' } = {}) {
  return `
      <motion-bar class="quota-status" style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.9rem;margin-bottom:0.75rem">
        <div>Quota Release Time: <span data-dd-quota="quotaReleaseTime">${quota.releaseTime}</span></div>
        <div>System Time: <span data-dd-quota="systemTime" id="${systemId}">--:--:--</span></div>
        <div>Remaining Time: <span data-dd-quota="remainingTime" id="${remainId}">00:05:00</span></div>
        <div>Available Quota for (Current Day): <span data-dd-quota="availableQuota">${quota.available}</span></div>
        <div>Reporting Time: <span data-dd-quota="reportingTime">${quota.reporting}</span></div>
        <div>Payment Pending: <span data-dd-quota="paymentPending">0</span></div>
        <div>Success: <span data-dd-quota="successCount">3</span></div>
      </motion-bar>`;
}

function render() {
  const root = document.getElementById('root');
  const quota = { available: 18, releaseTime: '11:03 AM', reporting: '04:00 PM' };

  root.innerHTML = `
    <nav class="steps">
      ${['quota', 'booking', 'pilgrims', 'declaration', 'payment-summary', 'confirm']
        .map(
          (s) =>
            `<button type="button" class="step ${state.step === s ? 'active' : ''}" data-step="${s}">${s}</button>`
        )
        .join('')}
    </nav>

    <section class="panel" data-dd-step="quota" ${state.step === 'quota' ? '' : 'hidden'}>
      <h2>Quota information (read-only)</h2>
      ${quotaStatusHtml(quota)}
      <p class="hint">Displayed quota does not guarantee ticket issuance.</p>
      <button type="button" id="mock-continue" disabled aria-disabled="true">Continue</button>
    </section>

    <section class="panel" data-dd-step="booking" ${state.step === 'booking' ? '' : 'hidden'}>
      <h2>Booking &amp; donation</h2>
      <label>Donation amount (min ₹${MIN_DONATION.toLocaleString('en-IN')})</label>
      <input data-dd-field="donation-amount" type="number" />
      <p id="donation-error" class="err" hidden></p>
      <label>Booking category</label>
      <label><input type="radio" name="bc" data-dd-field="booking-category" value="CURRENT" ${
        state.bookingCategory === 'CURRENT' ? 'checked' : ''
      } /> Current Break Darshan</label>
      <label><input type="radio" name="bc" data-dd-field="booking-category" value="ADVANCE" ${
        state.bookingCategory === 'ADVANCE' ? 'checked' : ''
      } /> Advance / Future</label>
      <label>Preferred date (advance)</label>
      <input data-dd-field="preferred-date" type="date" />
      <div class="actions">
        <button type="button" data-next="quota">Back</button>
        <button type="button" id="validate-donation" data-next="pilgrims">Validate &amp; continue</button>
      </div>
    </section>

    <section class="panel" data-dd-step="pilgrims" ${state.step === 'pilgrims' ? '' : 'hidden'}>
      <h2>Pilgrim Details for TTD Break Darshan (${pilgrimSlots} slots)</h2>
      ${quotaStatusHtml(quota, { systemId: 'mock-pilgrim-system-time', remainId: 'mock-pilgrim-remaining-time' })}
      ${state.pilgrims
        .map(
          (p, i) => `
        <div class="pilgrim-block" data-pilgrim-index="${i}" data-dd-pilgrim-id="${params.get(`pid${i}`) || ''}">
          <h3>Pilgrim ${i + 1}</h3>
          <label>First / full name</label>
          <input data-dd-field="pilgrim-${i}-fullName" type="text" autocomplete="off" />
          <label>Date of birth</label>
          <input data-dd-field="pilgrim-${i}-dateOfBirth" type="date" autocomplete="off" />
          <label>Age</label>
          <input data-dd-field="pilgrim-${i}-age" type="number" autocomplete="off" />
          <label>Gender</label>
          <select data-dd-field="pilgrim-${i}-gender">
            <option value="">Select</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="T">Transgender</option>
            <option value="O">Other</option>
          </select>
          <label>ID type</label>
          <select data-dd-field="pilgrim-${i}-idType">
            <option value="">Select</option>
            <option value="Aadhaar">Aadhaar Card</option>
            <option value="Passport">Passport</option>
            <option value="PAN">PAN</option>
          </select>
          <label>ID number</label>
          <input data-dd-field="pilgrim-${i}-idNumber" type="text" autocomplete="off" />
          <label>Mobile</label>
          <input data-dd-field="pilgrim-${i}-mobile" type="text" autocomplete="off" />
          <label>City</label>
          <input data-dd-field="pilgrim-${i}-city" type="text" autocomplete="off" />
        </div>`
        )
        .join('')}
      <p class="hint">Dynamic pilgrim fields — use DarshanDesk extension on this step.</p>
      <div class="actions">
        <button type="button" data-next="booking">Back</button>
        <button type="button" id="mock-pilgrim-continue" disabled aria-disabled="true">Continue</button>
      </div>
    </section>

    <section class="panel" data-dd-step="payment-summary" ${state.step === 'payment-summary' ? '' : 'hidden'}>
      <h2>Donation and Darshan Payment Summary</h2>
      <p>Donation amount: <span data-dd-quota="mockDonation">₹${Number(state.donation || MIN_DONATION).toLocaleString('en-IN')}</span></p>
      <p>Break Darshan amount: <span data-dd-quota="mockDarshan">₹300</span></p>
      <p>Total payable: <span data-dd-quota="mockTotal">₹${(Number(state.donation || MIN_DONATION) + 300).toLocaleString('en-IN')}</span></p>
      <p>No. of pilgrims: <span data-dd-quota="mockPilgrimCount">${pilgrimSlots}</span></p>
      <p class="hint">Operator selects ICICI / HDFC / Union Bank and clicks Pay Now manually.</p>
      <button type="button" data-next="declaration">Back</button>
    </section>

    <section class="panel" data-dd-step="declaration" ${state.step === 'declaration' ? '' : 'hidden'}>
      <h2>Declarations (operator only)</h2>
      <label>
        <input data-dd-field="legal-consent" type="checkbox" />
        I accept legal terms on the official website
      </label>
      <p class="hint">DarshanDesk never auto-accepts this checkbox.</p>
      <div class="actions">
        <button type="button" data-next="pilgrims">Back</button>
        <button type="button" data-next="confirm">Review</button>
      </div>
    </section>

    <section class="panel" data-dd-step="confirm" ${state.step === 'confirm' ? '' : 'hidden'}>
      <h2>Confirmation simulator</h2>
      <div data-dd-captcha data-dd-field="captcha-required" hidden id="captcha-banner">
        CAPTCHA widget (fixture)
      </div>
      <label class="checkbox"><input type="checkbox" id="toggle-captcha" /> Simulate CAPTCHA required</label>
      <pre id="summary" class="hint"></pre>
      <label>Official response scenario</label>
      <select id="qa-scenario">
        <option value="quota_display_rejected">Quota shown but allocation rejected</option>
        <option value="quota_exhausted">Quota exhausted (0)</option>
        <option value="payment_pending">Payment pending</option>
        <option value="loading_stuck">Loading overlay stuck</option>
        <option value="duplicate_guard">Duplicate action guard (info)</option>
        <option value="session_expired">Session expired</option>
        <option value="eligibility_error">Eligibility error</option>
        <option value="payment_gateway_error">Payment gateway error</option>
        <option value="unknown_outcome">Unknown outcome</option>
        <option value="confirmed">Confirmed transaction</option>
        <option value="rate_limit">Rate limited</option>
      </select>
      <button type="button" id="qa-simulate">Simulate official check</button>
      <pre id="qa-output" class="hint"></pre>
      <button type="button" id="manual-submit">Operator submits on real site (mock no-op)</button>
    </section>
  `;

  root.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => setStep(btn.getAttribute('data-step')));
  });

  const mockContinue = root.querySelector('#mock-continue');
  if (mockContinue) {
    mockContinue.addEventListener('click', (e) => {
      if (mockContinue.hasAttribute('disabled')) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      showMockOfficialLoading(() => setStep('booking'));
    });
  }

  const pilgrimContinue = root.querySelector('#mock-pilgrim-continue');
  if (pilgrimContinue) {
    pilgrimContinue.addEventListener('click', (e) => {
      if (pilgrimContinue.hasAttribute('disabled')) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      showMockOfficialLoading(() => setStep('payment-summary'));
    });
  }

  root.querySelectorAll('[data-next]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.id === 'validate-donation') {
        const amount = Number(state.donation);
        const err = root.querySelector('#donation-error');
        if (!Number.isFinite(amount) || amount < MIN_DONATION) {
          err.hidden = false;
          err.textContent = `Donation must be at least ₹${MIN_DONATION.toLocaleString('en-IN')}`;
          return;
        }
        err.hidden = true;
      }
      setStep(btn.getAttribute('data-next'));
    });
  });

  bindControlled(root.querySelector('[data-dd-field="donation-amount"]'), () => state.donation, (v) => {
    state.donation = v;
  });
  bindControlled(root.querySelector('[data-dd-field="preferred-date"]'), () => state.preferredDate, (v) => {
    state.preferredDate = v;
  });

  root.querySelectorAll('[data-dd-field="booking-category"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) state.bookingCategory = radio.value;
    });
  });

  state.pilgrims.forEach((p, i) => {
    const block = root.querySelector(`[data-pilgrim-index="${i}"]`);
    if (!block) return;
    const fields = ['fullName', 'dateOfBirth', 'age', 'gender', 'idType', 'idNumber', 'mobile', 'city'];
    fields.forEach((f) => {
      bindControlled(
        block.querySelector(`[data-dd-field="pilgrim-${i}-${f}"]`),
        () => p[f],
        (v) => {
          p[f] = v;
        }
      );
    });
  });

  root.querySelector('#summary').textContent = JSON.stringify(
    {
      step: state.step,
      bookingCategory: state.bookingCategory,
      donation: state.donation,
      pilgrimSlots,
    },
    null,
    2
  );

  const scenarios = {
    quota_display_rejected: {
      message: 'Cannot book as quota exceeded',
      serverRejected: true,
      banner: 'Cannot book as quota exceeded',
      availableQuota: 183,
      paymentPending: 317,
      successCount: 0,
    },
    quota_exhausted: { message: 'No quota available', banner: 'No quota available', availableQuota: 0 },
    payment_pending: { message: 'Payment pending confirmation', paymentPending: true, banner: 'Payment pending for pilgrim booking' },
    loading_stuck: { loadingOverlay: true, banner: 'Please wait… loading' },
    duplicate_guard: { message: 'Simulate duplicate extension action blocked', banner: null },
    session_expired: { message: 'Session expired — please login again', banner: 'Session expired — please login again' },
    eligibility_error: { message: 'Not eligible for current break darshan', banner: 'Not eligible for current break darshan' },
    payment_gateway_error: { message: 'Payment failed at gateway', banner: 'Payment failed at gateway' },
    unknown_outcome: { message: 'Unexpected official response code 9001', banner: 'Unexpected official response code 9001' },
    confirmed: {
      message: 'Booking confirmed. Reference number TTD-MOCK-REF-001',
      banner: 'Booking confirmed. Reference number TTD-MOCK-REF-001',
      confirmed: true,
    },
    rate_limit: { message: 'Too many requests (429)', banner: 'Too many requests (HTTP 429 rate limit)' },
  };

  root.querySelector('#qa-simulate').addEventListener('click', () => {
    const key = root.querySelector('#qa-scenario').value;
    const scenario = scenarios[key];
    root.querySelector('#qa-output').textContent = JSON.stringify(scenario, null, 2);
    document.getElementById('mock-official-loading')?.remove();
    document.getElementById('qa-official-banner')?.remove();
    if (scenario.loadingOverlay) {
      const el = document.createElement('div');
      el.id = 'mock-official-loading';
      el.className = 'mock-loading-overlay';
      el.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.5);color:#fff;display:flex;align-items:center;justify-content:center;z-index:9999';
      el.textContent = scenario.banner || 'Please wait… loading';
      document.body.appendChild(el);
    } else     if (key === 'quota_display_rejected' || scenario.serverRejected) {
      document.body.setAttribute(
        'data-dd-booking-stage-response',
        JSON.stringify({
          endpoint: '/dms/srivaniCurrentDayDarshanBooking',
          httpStatus: 200,
          body: { error: scenario.banner || scenario.message || 'Cannot book as quota exceeded' },
        })
      );
    } else {
      document.body.removeAttribute('data-dd-booking-stage-response');
    }

    if (scenario.banner) {
      const el = document.createElement('div');
      el.id = 'qa-official-banner';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'margin:1rem 0;padding:0.75rem;border:2px solid #b91c1c;background:#fef2f2;color:#7f1d1d;font-weight:600';
      el.textContent = scenario.banner;
      root.prepend(el);
    }
    if (scenario.availableQuota != null) {
      document.querySelectorAll('[data-dd-quota="availableQuota"]').forEach((n) => {
        n.textContent = String(scenario.availableQuota);
      });
    }
    if (scenario.paymentPending != null) {
      document.querySelectorAll('[data-dd-quota="paymentPending"]').forEach((n) => {
        n.textContent = String(scenario.paymentPending);
      });
    }
    if (scenario.successCount != null) {
      document.querySelectorAll('[data-dd-quota="successCount"]').forEach((n) => {
        n.textContent = String(scenario.successCount);
      });
    }
  });

  const captchaToggle = root.querySelector('#toggle-captcha');
  const captchaBanner = root.querySelector('#captcha-banner');
  if (captchaToggle && captchaBanner) {
    captchaToggle.addEventListener('change', () => {
      captchaBanner.hidden = !captchaToggle.checked;
    });
  }

  root.querySelector('#manual-submit').addEventListener('click', (e) => {
    e.preventDefault();
    alert('Mock only — operator completes submission and payment on the official portal.');
  });

  if (window.__ddMockQuotaClock) {
    clearInterval(window.__ddMockQuotaClock);
    window.__ddMockQuotaClock = null;
  }
  const countdownSteps = [
    {
      step: 'quota',
      continueId: 'mock-continue',
      systemId: 'mock-system-time',
      remainId: 'mock-remaining-time',
    },
    {
      step: 'pilgrims',
      continueId: 'mock-pilgrim-continue',
      systemId: 'mock-pilgrim-system-time',
      remainId: 'mock-pilgrim-remaining-time',
    },
  ];
  const active = countdownSteps.find((c) => c.step === state.step);
  if (active) {
    const cont = root.querySelector(`#${active.continueId}`);
    const sys = root.querySelector(`#${active.systemId}`);
    const rem = root.querySelector(`#${active.remainId}`);
    if (cont && sys && rem) {
      let remainSec = 6;
      cont.setAttribute('disabled', '');
      cont.setAttribute('aria-disabled', 'true');
      const tick = () => {
        const now = new Date();
        sys.textContent = now.toLocaleTimeString('en-IN', { hour12: false });
        const mm = String(Math.floor(remainSec / 60)).padStart(2, '0');
        const ss = String(remainSec % 60).padStart(2, '0');
        rem.textContent = `00:${mm}:${ss}`;
        if (remainSec <= 0) {
          cont.removeAttribute('disabled');
          cont.setAttribute('aria-disabled', 'false');
        }
        remainSec -= 1;
      };
      tick();
      window.__ddMockQuotaClock = setInterval(tick, 1000);
    }
  }
}

document.body.setAttribute('data-dd-mapping', 'mock-srivani-v1');
document.body.setAttribute('data-dd-form-version', '3');
document.body.setAttribute('data-dd-active-step', 'quota');

setTimeout(render, 300);