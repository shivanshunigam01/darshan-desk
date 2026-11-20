from __future__ import annotations

from typing import Any

from loguru import logger

from app.core.config import settings
from app.services.ttd.booking_helper import (
    DEFAULT_RAZORPAY_PG_ID,
    NTP_TIMEOUT_SECONDS,
    ClockSource,
    IDTypes,
    LoginCredentials,
    Pilgrim,
    run_current,
)
from app.services.ttd.browser_checkout import open_razorpay_checkout
from app.services.ttd.client import TTDClient
from app.workers.models import Task


class PayloadBookingClient:
    """Current-day HTTP booking strategy followed by a browser Razorpay handoff.

    The existing browser strategy is untouched. This strategy uses the tested
    HTTP booking helper to produce the sensitive checkout payload in memory,
    then creates the visible browser session and reuses the current portal
    login/window management functions to open Razorpay.
    """

    def __init__(
        self,
        task_id: str,
        worker_id: int,
        *,
        headless: bool | None = None,
        trace: bool = False,
    ) -> None:
        self.task_id = task_id
        self.worker_id = worker_id
        self.headless = headless
        self.trace = trace
        self.log = logger.bind(worker_id=worker_id, job_id=task_id)
        self.browser_client: TTDClient | None = None

    def get_captcha_state(self) -> dict[str, Any]:
        if self.browser_client is None:
            return {}
        return self.browser_client.get_captcha_state()

    async def show_browser(self) -> None:
        if self.browser_client is None:
            raise RuntimeError("The booking browser has not opened yet")
        await self.browser_client.show_browser()

    async def submit_pilgrim_captcha(self, value: str) -> None:
        if self.browser_client is None:
            raise RuntimeError("No browser CAPTCHA is awaiting review for this strategy")
        await self.browser_client.submit_pilgrim_captcha(value)

    @staticmethod
    def _to_helper_pilgrims(items: list[dict[str, Any]]) -> list[Pilgrim]:
        id_type_by_name = {
            "aadhaar card": IDTypes.AADHAR,
            "aadhar card": IDTypes.AADHAR,
            "aadhaar": IDTypes.AADHAR,
            "aadhar": IDTypes.AADHAR,
            "passport": IDTypes.PASSPORT,
        }
        gender_by_name = {"M": "M", "F": "F", "T": "O"}
        pilgrims: list[Pilgrim] = []
        for item in items:
            id_type = id_type_by_name.get(str(item.get("id_type", "")).strip().lower())
            if id_type is None:
                raise ValueError(
                    "Unsupported ID type for HTTP payload strategy: "
                    f"{item.get('id_type')!r}"
                )
            gender = gender_by_name.get(str(item.get("gender", "")).strip().upper())
            if gender is None:
                raise ValueError(f"Unsupported pilgrim gender: {item.get('gender')!r}")
            pilgrims.append(
                Pilgrim(
                    piligrimName=str(item["name"]).strip(),
                    piligrimAge=int(item["age"]),
                    piligrimGender=gender,
                    piligrimIdProofType=id_type,
                    idProofNumber=str(item["id_doc_number"]).strip(),
                )
            )
        return pilgrims

    async def execute_auto(self, task: Task) -> dict[str, Any]:
        booking = task.payload
        if booking.get("booking_type", "current") != "current":
            raise ValueError(
                "The HTTP payload + Razorpay strategy currently supports current-day SRIVANI bookings only. "
                "Select the fully browser-based strategy for future bookings."
            )

        username = str(booking["username"])
        password = str(booking["password"])
        pilgrims = self._to_helper_pilgrims(booking.get("pilgrim_details") or [])
        donation = int(booking["donation"])

        self.log.info(
            "Starting HTTP-payload booking strategy: booking_type=current, pilgrims={}, donation={}",
            len(pilgrims),
            donation,
        )
        # booking_helper uses the module-level Loguru logger. Carry this task's
        # context into that helper so its progress appears in this task's log
        # view instead of being recorded under the fallback job ID.
        with logger.contextualize(job_id=self.task_id, worker_id=self.worker_id):
            self.log.info("HTTP helper: starting TTD authentication and quota checks")
            checkout_payload = await run_current(
                LoginCredentials(username=username, password=password),
                pilgrims=pilgrims,
                slot_id=31,
                slot_name_override=None,
                dry_run=False,
                pg_id=DEFAULT_RAZORPAY_PG_ID,
                payment_payload_out=None,
                donation_amount=donation,
                clock_source=ClockSource(booking.get("clock_source", "ttd")),
                continue_attempts=int(booking.get("continue_attempts", 3)),
                booking_attempts=int(booking.get("booking_attempts", 2)),
                attempt_stagger_seconds=float(booking.get("attempt_stagger_seconds", 0.0)),
                ntp_servers=booking.get("ntp_servers") or None,
                ntp_timeout=float(booking.get("ntp_timeout_seconds", NTP_TIMEOUT_SECONDS)),
            )
        if not checkout_payload:
            raise RuntimeError(
                "The HTTP booking helper did not produce a checkout payload. "
                "Review the task logs and TTD booking/payment history before retrying."
            )

        # Do not open a browser while the HTTP helper waits for the quota release;
        # start the authenticated visible browser only once a payload is ready.
        browser = TTDClient(
            task_id=self.task_id,
            worker_id=self.worker_id,
            headless=self.headless if self.headless is not None else settings.HEADLESS,
            trace=self.trace,
        )
        async with browser:
            self.browser_client = browser
            try:
                state = await browser.open_login()
                await browser.login_auto(username, password)
                await browser._require_auto_session("post-login for Razorpay checkout handoff")
                checkout_opened = await open_razorpay_checkout(browser.page, checkout_payload)
                if not checkout_opened:
                    self.log.error(
                        "Checkout payload was created, but Razorpay UI was not detected. "
                        "The existing booking/order may still be active; inspect it before retrying."
                    )
                    await browser.keep_alive_until_closed()
                    raise RuntimeError(
                        "Razorpay checkout UI was not detected; inspect the browser and booking status."
                    )

                self.log.success(
                    "HTTP payload strategy opened Razorpay checkout. Complete payment manually, "
                    "then verify the TTD booking history."
                )
                await browser.keep_alive_until_closed()
                return {
                    "provider": "ttd",
                    "worker_id": self.worker_id,
                    "booking_strategy": "http_payload",
                    "state": state,
                    "checkout_opened": True,
                    "paid": False,
                    "success": True,
                    "message": (
                        "TTD booking and Razorpay order initialized; checkout was opened. "
                        "Payment remains manual, and the booking status must be verified on TTD."
                    ),
                }
            finally:
                self.browser_client = None
