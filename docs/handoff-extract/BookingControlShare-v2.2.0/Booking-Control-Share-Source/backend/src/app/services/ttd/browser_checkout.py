from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from loguru import logger
from playwright.async_api import Page

TTD_ORIGIN = "https://tirupatibalaji.ap.gov.in"
PAYLOAD_INPUT_SELECTOR = "#ttd-rzp-helper-payload"
CHECKOUT_BUTTON_NAME = "Validate & open Razorpay"
CHECKOUT_UI_SELECTOR = (
    'iframe[name="razorpay-checkout-frame"], '
    "iframe#razorpay-checkout-frame, "
    'iframe[src*="razorpay.com"], '
    ".razorpay-container, .razorpay-backdrop"
)


def validate_checkout_payload(payload: dict[str, Any]) -> None:
    """Validate the minimum shape expected by the in-page TTD helper."""
    for field in ("token", "nonce", "orderId", "keyId"):
        if not isinstance(payload.get(field), str) or not payload[field].strip():
            raise ValueError(f"Checkout payload is missing a non-empty {field!r} field")

    payment_params = payload.get("paymentParams")
    if not isinstance(payment_params, dict):
        raise ValueError("Checkout payload is missing the paymentParams object")
    if not isinstance(payment_params.get("orderId"), str) or not payment_params["orderId"].strip():
        raise ValueError("paymentParams.orderId (the TTD booking ID) is missing")
    if str(payment_params["orderId"]) == str(payload["orderId"]):
        raise ValueError("TTD booking ID and Razorpay order ID must be distinct")
    try:
        amount = float(payment_params.get("amount"))
    except (TypeError, ValueError) as exc:
        raise ValueError("paymentParams.amount must be a positive number") from exc
    if not math.isfinite(amount) or amount <= 0 or not amount.is_integer():
        raise ValueError("paymentParams.amount must be a positive finite whole number of rupees")
    if not payment_params.get("pgId") or not payment_params.get("currency"):
        raise ValueError("paymentParams.pgId and paymentParams.currency are required")


async def open_razorpay_checkout(
    page: Page,
    payload: dict[str, Any],
    *,
    helper_path: Path | None = None,
    checkout_timeout_seconds: float = 8.0,
) -> bool:
    """Inject the helper, pass the payload directly, and open Razorpay once.

    This opens the checkout UI only. The user must still review the amount/order
    confirmation and complete any payment themselves in Razorpay.
    """
    validate_checkout_payload(payload)
    parsed = urlparse(page.url)
    if parsed.scheme != "https" or parsed.netloc != "tirupatibalaji.ap.gov.in":
        raise RuntimeError("The active browser page must be on the TTD portal before checkout")

    script_path = helper_path or Path(__file__).with_name("razorpay_browser_helper_v2.js")
    if not script_path.is_file():
        raise FileNotFoundError(f"TTD Razorpay helper script not found: {script_path}")

    expected_ttd_order = str(payload["paymentParams"]["orderId"])
    expected_rzp_order = str(payload["orderId"])
    amount = int(float(payload["paymentParams"]["amount"]))
    amount_tail = f"{amount % 1000:03d}"
    amount_prefix = amount // 1000
    amount_groups: list[str] = []
    while amount_prefix:
        amount_groups.insert(0, str(amount_prefix % 100))
        amount_prefix //= 100
    if amount_groups:
        expected_amount = ",".join([*amount_groups, amount_tail])
    else:
        expected_amount = str(amount)

    async def handle_dialog(dialog) -> None:
        # The helper's order/amount confirmation is expected. Dismiss every
        # other dialog rather than accepting an unrelated portal prompt.
        message = dialog.message or ""
        is_checkout_confirmation = (
            dialog.type == "confirm"
            and "Open Razorpay Checkout?" in message
            and f"₹{expected_amount}" in message
            and expected_ttd_order in message
            and expected_rzp_order in message
        )
        if is_checkout_confirmation:
            logger.info(
                "Accepting the helper's checkout-opening confirmation after matching the amount "
                "and both order IDs (TTD order {}, Razorpay order {})",
                expected_ttd_order,
                expected_rzp_order,
            )
            await dialog.accept()
        else:
            logger.warning("Dismissing an unexpected browser dialog during checkout handoff")
            await dialog.dismiss()

    page.on("dialog", handle_dialog)
    try:
        await page.add_script_tag(path=str(script_path.resolve()))
        payload_input = page.locator(PAYLOAD_INPUT_SELECTOR)
        await payload_input.wait_for(state="visible", timeout=10_000)
        # The bearer token and nonce remain in memory; no handoff file or logs.
        await payload_input.fill(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        checkout_button = page.get_by_role("button", name=CHECKOUT_BUTTON_NAME)
        await checkout_button.click(timeout=90_000)

        deadline = time.monotonic() + max(0.1, checkout_timeout_seconds)
        while time.monotonic() < deadline:
            try:
                checkout = page.locator(CHECKOUT_UI_SELECTOR).first
                if await checkout.is_visible():
                    logger.success("Razorpay checkout UI opened")
                    return True
            except Exception:
                pass
            await page.wait_for_timeout(50)

        logger.error(
            "The helper ran, but Razorpay checkout UI was not detected. "
            "Inspect the browser and booking/payment status before retrying."
        )
        return False
    finally:
        page.remove_listener("dialog", handle_dialog)
