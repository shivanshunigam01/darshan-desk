"""Opt-in real-browser test for the HTTP-payload-to-Razorpay handoff.

Run from backend/ with TTD_BROWSER_INTEGRATION=1 uv run pytest
 tests/test_payload_checkout_browser.py -q. The browser is visible so its final
 Razorpay test frame can be inspected manually.

All TTD-origin traffic is intercepted and Razorpay is stubbed. No real booking,
TTD API call, payment order, or payment is created by this test.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.services.ttd.browser_checkout import open_razorpay_checkout

pytestmark = pytest.mark.skipif(
    os.environ.get("TTD_BROWSER_INTEGRATION") != "1",
    reason="set TTD_BROWSER_INTEGRATION=1 to run the browser handoff integration test",
)

TTD_ORIGIN = "https://tirupatibalaji.ap.gov.in"

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
        "userId": "a",
        "email": "test@example.invalid",
        "orderId": "TTD-BOOKING-TEST-123456",
        "currency": "INR",
        "behalf": "",
        "modName": "EDON",
        "mobileNumber": "9000000000",
        "address": "",
        "trustId": "23",
        "trustName": "SRIVANI TEST TRUST",
    },
}

RAZORPAY_STUB = r"""
(() => {
  window.__ttdRazorpayTest = { opened: false, options: null, events: {} };
  window.Razorpay = class RazorpayTestDouble {
    constructor(options) {
      window.__ttdRazorpayTest.options = options;
    }
    on(name, callback) {
      window.__ttdRazorpayTest.events[name] = callback;
      return this;
    }
    open() {
      window.__ttdRazorpayTest.opened = true;
      const frame = document.createElement('iframe');
      frame.id = 'razorpay-checkout-frame';
      frame.title = 'Razorpay test checkout';
      frame.style.cssText = 'width:800px;height:600px;position:fixed;inset:20px;z-index:2147483647';
      document.body.appendChild(frame);
    }
  };
})();
"""


@pytest.mark.asyncio
async def test_browser_opens_razorpay_from_valid_checkout_payload() -> None:
    from app.core.browser import BrowserContextFactory

    context = None
    scratch_dir: Path | None = None
    try:
        context, page, scratch_dir = await BrowserContextFactory.launch(
            worker_id=987_654, headless=False, trace=False
        )

        async def fulfill_ttd(route) -> None:
            await route.fulfill(
                status=200,
                content_type="text/html",
                body="<!doctype html><html><head><title>TTD test page</title></head><body></body></html>",
            )

        await page.route(f"{TTD_ORIGIN}/**", fulfill_ttd)
        await page.add_init_script(RAZORPAY_STUB)
        await page.goto(f"{TTD_ORIGIN}/#/userLogin", wait_until="domcontentloaded")

        opened = await open_razorpay_checkout(
            page,
            VALID_TEST_CHECKOUT_PAYLOAD,
            checkout_timeout_seconds=2.0,
        )

        assert opened is True
        state = await page.evaluate("window.__ttdRazorpayTest")
        assert state["opened"] is True
        assert state["options"]["key"] == VALID_TEST_CHECKOUT_PAYLOAD["keyId"]
        assert state["options"]["order_id"] == VALID_TEST_CHECKOUT_PAYLOAD["orderId"]
        assert state["options"]["amount"] == 1_234_500  # ₹12,345 converted to paise
        assert state["options"]["currency"] == "INR"
        assert await page.locator("#razorpay-checkout-frame").is_visible()
        await page.wait_for_timeout(10_000)
    finally:
        if context is not None and scratch_dir is not None:
            await BrowserContextFactory.cleanup(context, scratch_dir)
