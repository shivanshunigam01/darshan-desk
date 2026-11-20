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

function render() {
  const root = document.getElementById('root');
  const quota = { available: 18, releaseTime: '11:03 AM', reporting: '04:00 PM' };

  root.innerHTML = `
    <nav class="steps">
      ${['quota', 'booking', 'pilgrims', 'declaration', 'confirm']
        .map(
          (s) =>
            `<button type="button" class="step ${state.step === s ? 'active' : ''}" data-step="${s}">${s}</button>`
        )
        .join('')}
    </nav>

    <section class="panel" data-dd-step="quota" ${state.step === 'quota' ? '' : 'hidden'}>
      <h2>Quota information (read-only)</h2>
      <p data-dd-field="quota-available">Available quota: <strong>${quota.available}</strong></p>
      <p>Release time: ${quota.releaseTime} · Reporting: ${quota.reporting}</p>
      <p class="hint">Displayed quota does not guarantee ticket issuance.</p>
      <button type="button" class="next" data-next="booking">Continue to booking</button>
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
      <h2>Pilgrim details (${pilgrimSlots} slots)</h2>
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
        <button type="button" data-next="declaration">Continue</button>
      </div>
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
        <option value="quota_exceeded">Cannot book as quota exceeded</option>
        <option value="session_expired">Official session expired</option>
        <option value="rate_limit">HTTP 429 rate limit</option>
        <option value="success_pending">Payment pending</option>
      </select>
      <button type="button" id="qa-simulate">Simulate official check</button>
      <pre id="qa-output" class="hint"></pre>
      <button type="button" id="manual-submit">Operator submits on real site (mock no-op)</button>
    </section>
  `;

  root.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => setStep(btn.getAttribute('data-step')));
  });

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
    quota_exceeded: { message: 'Cannot book as quota exceeded', serverRejected: true },
    session_expired: { message: 'Session expired — please login again', serverRejected: false },
    rate_limit: { message: 'Too many requests (429)', serverRejected: false, httpStatus: 429 },
    success_pending: { message: 'Payment pending confirmation', serverRejected: false, paymentPending: true },
  };

  root.querySelector('#qa-simulate').addEventListener('click', () => {
    const key = root.querySelector('#qa-scenario').value;
    root.querySelector('#qa-output').textContent = JSON.stringify(scenarios[key], null, 2);
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
}

document.body.setAttribute('data-dd-mapping', 'mock-srivani-v1');
document.body.setAttribute('data-dd-form-version', '3');
document.body.setAttribute('data-dd-active-step', 'quota');

setTimeout(render, 300);