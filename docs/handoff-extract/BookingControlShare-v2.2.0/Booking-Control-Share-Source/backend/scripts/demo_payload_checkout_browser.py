"""Manual visible-browser demo for TTD login + OCR + Razorpay handoff.

Run from backend/ after applying the payload-checkout strategy patch:

    uv run python scripts/demo_payload_checkout_browser.py

This performs a REAL TTD portal login using TTDClient.login_auto(), including
its existing CAPTCHA OCR/retry flow. After login, it substitutes a local
Razorpay SDK test double and injects the same in-page checkout helper used by
the new strategy. The test double displays a clearly labelled mock checkout.

Safety: the script does not book a darshan, initialize a real payment order,
load Razorpay's real SDK, or make a payment. Login traffic to TTD is real;
the checkout UI is a local mock and never calls the payment handler.
"""

from __future__ import annotations

import asyncio
import getpass
import os
import sys

from app.services.ttd.browser_checkout import open_razorpay_checkout
from app.services.ttd.client import TTDClient

VALID_TEST_CHECKOUT_PAYLOAD = {
    "token": "test-ttd-auth-token",
    "nonce": "test-payment-nonce",
    "orderId": "order_rzp_test_123456",
    "keyId": "rzp_test_1234567890",
    "paymentParams": {
        "amount": 12345,
        "firstName": "Test",
        "lastName": "Pilgrim",
        "pgId": "15",
        "userId": "test-user",
        "email": "test@example.invalid",
        "orderId": "TEST-BOOKING-123456",
        "currency": "INR",
        "behalf": "",
        "modName": "EDON",
        "mobileNumber": "9000000000",
        "address": "",
        "trustId": "23",
        "trustName": "TEST TRUST",
    },
}

# Installed only AFTER authenticating to TTD, so it cannot interfere with login.
# This mock deliberately never invokes the checkout success handler, meaning
# no request is sent to TTD's payment-verification endpoint.
RAZORPAY_TEST_DOUBLE = r"""
(() => {
  window.__ttdRazorpayDemo = { opened: false, options: null, events: {} };
  window.Razorpay = class RazorpayDemoDouble {
    constructor(options) {
      window.__ttdRazorpayDemo.options = options;
    }
    on(name, callback) {
      window.__ttdRazorpayDemo.events[name] = callback;
      return this;
    }
    open() {
      window.__ttdRazorpayDemo.opened = true;
      const options = window.__ttdRazorpayDemo.options || {};
      const frame = document.createElement('iframe');
      frame.id = 'razorpay-checkout-frame';
      frame.title = 'Mock Razorpay checkout — test only';
      frame.style.cssText = [
        'width:min(800px,calc(100vw - 40px))', 'height:min(600px,calc(100vh - 40px))',
        'position:fixed', 'inset:20px', 'z-index:2147483647', 'background:#fff',
        'border:1px solid #bbb', 'border-radius:12px', 'box-shadow:0 12px 40px #0005'
      ].join(';');
      frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
        <title>Mock Razorpay checkout</title></head>
        <body style="margin:0;padding:32px;font:16px/1.5 system-ui,sans-serif;color:#19202a;background:#f7f9fc">
        <main style="max-width:560px;margin:24px auto;padding:28px;background:#fff;border:1px solid #d7deea;border-radius:12px">
          <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#a13a18">TEST MODE — NO PAYMENT</div>
          <h1 style="margin:12px 0 6px;font-size:26px">Mock Razorpay Checkout</h1>
          <p>This confirms that browser automation reached the Razorpay SDK <code>open()</code> call.</p>
          <hr style="border:0;border-top:1px solid #e3e7ee;margin:22px 0">
          <p><b>Amount:</b> ₹12,345 INR</p>
          <p><b>Razorpay order:</b> ${String(options.order_id || 'not provided')}</p>
          <p><b>Key:</b> ${String(options.key || 'not provided')}</p>
          <p style="color:#a13a18;margin-top:24px">This is a local mock frame, not the real Razorpay website. No pay button is provided.</p>
        </main></body></html>`;
      document.body.appendChild(frame);
    }
  };
})();
"""


async def main() -> int:
    print("TTD browser login + checkout handoff demo")
    print(
        "This will log in to the real TTD portal. Checkout will be mocked; no booking/payment is made.\n"
    )

    username = os.environ.get("TTD_USERNAME") or input("TTD username: ").strip()
    password = getpass.getpass("TTD password: ")
    if not username or not password:
        print("Username and password are required.", file=sys.stderr)
        return 2

    browser = TTDClient(
        task_id="manual-payload-checkout-demo",
        worker_id=os.getpid(),
        headless=False,
        trace=False,
    )

    async with browser:
        try:
            state = await browser.open_login()
            print(f"Opened browser: {state.get('title', '')} — {state.get('url', '')}")
            print("Logging in with the application's built-in CAPTCHA OCR/retry flow…")
            await browser.login_auto(username, password)
            await browser._require_auto_session("manual payload checkout demo")
            print("TTD login confirmed. Replacing Razorpay SDK with local test double…")

            # await browser.page.evaluate(RAZORPAY_TEST_DOUBLE)
            print("Injecting checkout helper and passing the test payload in memory…")
            opened = await open_razorpay_checkout(
                browser.page,
                VALID_TEST_CHECKOUT_PAYLOAD,
                checkout_timeout_seconds=5.0,
            )

            if not opened:
                print(
                    "The helper did not detect the mock checkout. The browser will stay open "
                    "so you can inspect the page. Close the browser window to exit."
                )
                await browser.keep_alive_until_closed()
                return 1

            print("\nSuccess: checkout helper called the mock Razorpay open() method.")
            print(
                "Inspect the browser: the frame should say 'Mock Razorpay Checkout' and 'TEST MODE'."
            )
            print(
                "The browser will stay open until you close its window. No payment handler is triggered."
            )
            await browser.keep_alive_until_closed()
            return 0
        except Exception as exc:
            browser.log.exception("Browser checkout demo failed")
            print(f"Demo failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            print(
                "The browser will remain open for inspection if it is still usable.",
                file=sys.stderr,
            )
            try:
                if not browser.page.is_closed():
                    await browser.keep_alive_until_closed()
            except Exception:
                pass
            return 1


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("\nInterrupted by user.")
