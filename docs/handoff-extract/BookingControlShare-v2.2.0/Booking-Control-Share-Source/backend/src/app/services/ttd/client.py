from __future__ import annotations

import asyncio
import base64
import os
import re
import subprocess
import time
from collections.abc import Callable, Sequence
from datetime import date
from pathlib import Path
from typing import Any

import httpx
from loguru import logger
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from app.core.browser import BrowserContextFactory
from app.core.config import settings
from app.helpers.text import ocr_image
from app.workers.models import MAX_PILGRIMS_PER_BOOKING, Task

# Selectors for the manual-fill booking form. Kept as module-level constants
# so they're easy to update if the portal markup changes.
CURRENT_FORM_SELECTOR = 'form[name="userForm2"]'
FUTURE_FORM_SELECTOR = 'form[name="userForm"]'

NAME_INPUT_SELECTOR = '.form-group input[id="fName1"]'
AGE_INPUT_SELECTOR = '.form-group input[name="age1"]'
ID_PROOF_INPUT_SELECTOR = '.form-group input[id="proofId1"]'
CONTINUE_BUTTON_SELECTOR = 'button[id="smp"]'

RELEASE_TIME_SELECTOR = 'span[ng-bind="dccsc.quotaReleaseTime"]'
SERVER_TIME_SELECTOR = 'span[ng-bind="dccsc.serverTime"]'

RADIO_INPUT_SELECTOR = 'input[ng-change*="bankValue"]'
PAY_NOW_BUTTON_XPATH = 'button[id="edonation_paynow"]'
PREFERRED_PAYMENT_GATEWAY_ID = (
    "15"  # HDFC Razorpay in the inspected TTD bundle; verify live bank list.
)
PAYMENT_LOADER_SELECTOR = "#loader"
POST_CONTINUE_TIMEOUT_SECONDS = 30.0
LOGIN_STABILITY_SECONDS = 0.75
HOT_POLL_MILLISECONDS = 10

# Logged-in user name displayed in the portal header.
LOGGED_IN_USER_XPATH = '//strong[@class="ng-binding"][1]'
LOGGED_IN_SELECTOR = "nav[ng-hide*='updateProfileOtp'] a[ng-click='logout()']"

# ---------------------------------------------------------------------------
# Fully-automated flow selectors
# ---------------------------------------------------------------------------
LOGIN_USERNAME_SELECTOR = 'input[name="uName"]'
LOGIN_PASSWORD_SELECTOR = 'input[name="pwd"]'
LOGIN_CAPTCHA_IMG_SELECTOR = 'img[id="captcha"]'
LOGIN_CAPTCHA_INPUT_SELECTOR = 'input[id="txtInput"]'
LOGIN_CAPTCHA_REFRESH_SELECTOR = 'img[src="content/img/Refresh.png"]'
LOGIN_CAPTCHA_FAIL_SELECTOR = ".help-block.err.ng-binding"
LOGIN_BUTTON_SELECTOR = 'button[id="login_sub"]'
LOGIN_SUCCESS_LOCALSTORAGE_KEY = "loginSuccess"
AUTO_RECOVERY_LIMIT = 3
NAVIGATION_CLICK_LIMIT = 3
LOGIN_ENTRY_NAME = re.compile(r"^(?:log\s*in|sign\s*in)$", re.IGNORECASE)

DONATIONS_URL = "https://tirupatibalaji.ap.gov.in/#/srivaniedonations"
DONATION_AMOUNT_SELECTOR = 'input[id="amountD"]'
DONATION_CHECK_AMOUNT_SELECTOR = 'input[ng-model="sdcc.checkamount"]'
DONATION_CHECK_INDIAN_SELECTOR = 'input[ng-model="sdcc.indian"]'
CURRENT_BOOKING_BUTTON_SELECTOR = 'button[id="curr"]'
FUTURE_BOOKING_BUTTON_SELECTOR = 'button[id="adv"]'

CURRENT_CONFIRM_YES_BUTTON_SELECTOR = 'button[id="cok"]'
FUTURE_CONFIRM_CHECKBOX_SELECTOR = 'input[ng-model="sripgc.timeSlotCheck"]'
FUTURE_CONFIRM_YES_BUTTON_SELECTOR = 'button[id="genag"]'

FUTURE_BREAK_DARSHAN_CHECK = 'input[ng-model="sripgc.darshanCheck"]'
FUTURE_BREAK_DARSHAN_DATE_SELECTOR = 'input[id="darshanDate"]'
FUTURE_BREAK_DARSHAN_CALENDAR_SELECTOR = ".modal-body[class*='cal_info']"
FUTURE_BREAK_DARSHAN_AVAILABLE_SELECTOR = ".available"
FUTURE_BREAK_DARSHAN_UNRELEASED_SELECTOR = ".quotaNotReleased"
FUTURE_BREAK_DARSHAN_BOOKED_SELECTOR = ".booked"
FUTURE_BREAK_DARSHAN_CALENDAR_CLOSE_SELECTOR = 'button[class="close"]'
FUTURE_BREAK_DARSHAN_CONFIRM_SELECTOR = 'button[id="calok"]'
FUTURE_BREAK_DARSHAN_ADDITIONAL_LADDUS = 'input[id="addladdus"]'

# Pilgrim detail field selectors are templated with the pilgrim's 1-based
# serial number, e.g. NAME_INPUT_TEMPLATE.format(n=1) -> input[name="Name1"].
PILGRIM_NAME_TEMPLATE = '.form-group input[name="fName{n}"]'
PILGRIM_AGE_TEMPLATE = '.form-group input[name="age{n}"]'
PILGRIM_GENDER_SELECT_TEMPLATE = '.form-group select[name="gender{n}"]'
PILGRIM_ID_TYPE_SELECT_TEMPLATE = '.form-group select[name="proofS{n}"]'
PILGRIM_ID_DOC_NUMBER_TEMPLATE = '.form-group input[name="proofId{n}"]'

# Gender/id_type values map to the <option> labels/values on the portal.
GENDER_OPTION_VALUE = {"M": "Male", "F": "Female", "T": "Transgender"}
# Note the trailing space in "Aadhaar Card " / "Passport " - it's part of the
# portal's actual <option label="..."> markup, not a typo.
ID_TYPE_OPTION_LABEL = {"Aadhaar Card": "Aadhaar Card ", "Passport": "Passport "}

CURRENT_PILGRIM_CAPTCHA_CANVAS_SELECTOR = "#captchaCanvas"
CURRENT_PILGRIM_CAPTCHA_TEXT = 'input[id="captchaInput"]'
CURRENT_PILGRIM_CAPTCHA_REFRESH_SELECTOR = 'img[src="content/img/Refresh.png"]'

CURRENT_PILGIRM_PASSPORT_ALERT_SELECTOR = 'button[id="mpop"]'
FUTURE_PILGIRM_PASSPORT_ALERT_SELECTOR = 'button[id="pasok"]'

QUOTA_ALERT_SELECTOR = '.modal-body div[class="ng-scope"]'
QUOTA_NOT_RELEASED_TEXT = (
    "Your request could not be processed at this moment, as quota is not yet released."
)

CURRENT_CONTINUE_BTN = 'button[id="smp"]'
FUTURE_CONTINUE_BTN = 'button[id="sed_con"]'


def _focus_native_window(title: str) -> None:
    """Best-effort native window activation for supported desktop platforms."""
    try:
        if os.name == "nt":
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.WinDLL("user32", use_last_error=True)
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

            target = title.lower()

            EnumWindows = user32.EnumWindows
            EnumWindows.argtypes = [
                ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM),
                wintypes.LPARAM,
            ]
            EnumWindows.restype = wintypes.BOOL

            GetWindowTextLengthW = user32.GetWindowTextLengthW
            GetWindowTextLengthW.argtypes = [wintypes.HWND]
            GetWindowTextLengthW.restype = ctypes.c_int

            GetWindowTextW = user32.GetWindowTextW
            GetWindowTextW.argtypes = [
                wintypes.HWND,
                wintypes.LPWSTR,
                ctypes.c_int,
            ]
            GetWindowTextW.restype = ctypes.c_int

            IsWindowVisible = user32.IsWindowVisible
            IsWindowVisible.argtypes = [wintypes.HWND]
            IsWindowVisible.restype = wintypes.BOOL

            ShowWindow = user32.ShowWindow
            ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
            ShowWindow.restype = wintypes.BOOL

            SetForegroundWindow = user32.SetForegroundWindow
            SetForegroundWindow.argtypes = [wintypes.HWND]
            SetForegroundWindow.restype = wintypes.BOOL

            BringWindowToTop = user32.BringWindowToTop
            BringWindowToTop.argtypes = [wintypes.HWND]
            BringWindowToTop.restype = wintypes.BOOL

            GetCurrentThreadId = kernel32.GetCurrentThreadId
            GetCurrentThreadId.argtypes = []
            GetCurrentThreadId.restype = wintypes.DWORD

            GetWindowThreadProcessId = user32.GetWindowThreadProcessId
            GetWindowThreadProcessId.argtypes = [
                wintypes.HWND,
                ctypes.POINTER(wintypes.DWORD),
            ]
            GetWindowThreadProcessId.restype = wintypes.DWORD

            AttachThreadInput = user32.AttachThreadInput
            AttachThreadInput.argtypes = [
                wintypes.DWORD,
                wintypes.DWORD,
                wintypes.BOOL,
            ]
            AttachThreadInput.restype = wintypes.BOOL

            # --- Added: Missing APIs to bypass Foreground Lock ---
            GetForegroundWindow = user32.GetForegroundWindow
            GetForegroundWindow.argtypes = []
            GetForegroundWindow.restype = wintypes.HWND

            keybd_event = user32.keybd_event
            keybd_event.argtypes = [
                wintypes.BYTE,
                wintypes.BYTE,
                wintypes.DWORD,
                wintypes.ULONG_PTR,
            ]
            keybd_event.restype = None
            # -----------------------------------------------------

            EnumWindowsProc = ctypes.WINFUNCTYPE(
                ctypes.c_bool,
                wintypes.HWND,
                wintypes.LPARAM,
            )

            SW_RESTORE = 9
            found = {"hwnd": None}

            def callback(hwnd, _lparam):
                if not IsWindowVisible(hwnd):
                    return True

                length = GetWindowTextLengthW(hwnd)
                if length <= 0:
                    return True

                buf = ctypes.create_unicode_buffer(length + 1)
                GetWindowTextW(hwnd, buf, length + 1)

                if target in buf.value.lower():
                    found["hwnd"] = hwnd
                    return False

                return True

            callback_ref = EnumWindowsProc(callback)
            EnumWindows(callback_ref, 0)

            if found["hwnd"]:
                hwnd = found["hwnd"]
                foreground_hwnd = GetForegroundWindow()

                if hwnd == foreground_hwnd:
                    return  # Already focused

                current_thread = GetCurrentThreadId()
                foreground_thread = GetWindowThreadProcessId(foreground_hwnd, None)
                target_thread = GetWindowThreadProcessId(hwnd, None)

                attached_to_fg = False
                attached_to_target = False

                try:
                    # 1. Attach to the CURRENT foreground window's thread to inherit focus rights
                    if foreground_thread and foreground_thread != current_thread:
                        attached_to_fg = bool(
                            AttachThreadInput(current_thread, foreground_thread, True)
                        )

                    # 2. Attach to the target window's thread
                    if target_thread and target_thread != current_thread:
                        attached_to_target = bool(
                            AttachThreadInput(current_thread, target_thread, True)
                        )

                    # 3. Dummy ALT keypress (0x12 = VK_MENU, 2 = KEYEVENTF_KEYUP)
                    # Wakes up the input system and forces Windows to honor the SetForeground request.
                    keybd_event(0x12, 0, 0, 0)
                    keybd_event(0x12, 0, 2, 0)

                    # 4. Bring up the window
                    ShowWindow(hwnd, SW_RESTORE)
                    BringWindowToTop(hwnd)
                    SetForegroundWindow(hwnd)

                finally:
                    # ALWAYS clean up thread attachments; failing to do so freezes the UI
                    if attached_to_fg:
                        AttachThreadInput(current_thread, foreground_thread, False)
                    if attached_to_target:
                        AttachThreadInput(current_thread, target_thread, False)

            return

        if os.name == "posix" and (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
            # wmctrl works well under X11/XWayland. xdotool is the fallback.
            result = subprocess.run(
                ["wmctrl", "-a", title],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=2,
            )
            if result.returncode == 0:
                return

            subprocess.run(
                ["xdotool", "search", "--name", title, "windowactivate", "%@"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=2,
            )
    except (FileNotFoundError, subprocess.SubprocessError, OSError, Exception):
        # Native focus is deliberately best effort; Playwright's bring_to_front()
        # above remains the portable behavior.
        return


class QuotaNotReleasedError(Exception):
    """Raised when the portal shows the 'quota is not yet released' alert."""


class LoginFailedError(Exception):
    """Raised when login could not be completed (e.g. captcha kept failing)."""


class AutoSessionExpiredError(Exception):
    """Raised when the automatic workflow loses its authenticated session."""


def _parse_hms(text: str) -> tuple[int, int, int] | None:
    """Parse a value like '13:03:00' into (hour, minute, second)."""
    if not text:
        return None
    cleaned = text.strip().strip("[]").strip()
    parts = cleaned.split(":")
    if len(parts) != 3:
        return None
    try:
        h, m, s = (int(p) for p in parts)
        if not (0 <= h <= 23 and 0 <= m <= 59 and 0 <= s <= 59):
            return None
        return h, m, s
    except ValueError:
        return None


def _seconds_until_release(
    server_hms: tuple[int, int, int], release_hms: tuple[int, int, int]
) -> int:
    """Return seconds from the portal's server clock to the release clock.

    The portal exposes time-of-day values only, so a release time earlier than
    the current server time is treated as the next day's release.
    """
    server_seconds = server_hms[0] * 3600 + server_hms[1] * 60 + server_hms[2]
    release_seconds = release_hms[0] * 3600 + release_hms[1] * 60 + release_hms[2]
    delta = release_seconds - server_seconds
    if delta < 0:
        delta += 24 * 3600
    return delta


def _release_is_due(
    server_hms: tuple[int, int, int] | None,
    release_hms: tuple[int, int, int] | None,
) -> bool:
    """Return True when the portal server clock has reached the displayed release time."""
    if not server_hms or not release_hms:
        return False
    server_seconds = server_hms[0] * 3600 + server_hms[1] * 60 + server_hms[2]
    release_seconds = release_hms[0] * 3600 + release_hms[1] * 60 + release_hms[2]
    return server_seconds >= release_seconds


class TTDClient:
    """Provider client for the official TTD booking portal.

    Manual workflow:
      1. Open a visible browser and wait for the operator to fill the form.
      2. Read the portal's displayed server time and quota release time.
      3. Use that portal clock pair as the release-time synchronization source.
      4. Once release time is reached, use the Continue button's enabled state
         as an additional confirmation before clicking it.

    Current-booking CAPTCHA handling is coordinated with the local control UI.
    """

    def __init__(
        self, task_id: str, worker_id: int, headless: bool | None = None, trace: bool = False
    ):
        self.task_id: str = task_id
        self.worker_id = worker_id
        self.headless = headless
        self.trace: bool = trace
        self.log = logger.bind(worker_id=worker_id, job_id=task_id)
        self._last_release_snapshot: tuple[str, str, int | None] | None = None
        self._last_release_log_at = 0.0
        self._release_reached_logged = False
        self._continue_confirmation_logged = False
        self._last_status: str | None = None
        self.trace_path: Path | None = None
        self._trace_started = False
        self.ttd_auth_token = None

        # Network markers used to distinguish genuine auth failures from slow
        # Angular route transitions and slow server responses.
        self._last_continue_response_status: int | None = None
        self._last_continue_response_at = 0.0
        self._last_continue_click_at = 0.0
        self._last_booking_request_at = 0.0
        self._payment_action_started = False
        self._last_razorpay_details_request_at = 0.0
        self._last_razorpay_details_response_at = 0.0
        self._last_razorpay_details_response_status: int | None = None
        self._response_listener = None
        self._request_listener = None

        # Current-booking CAPTCHA state. These values stay local to the desktop
        # backend and are exposed only through the authenticated localhost API.
        self._captcha_event: asyncio.Event | None = None
        self._captcha_image: bytes | None = None
        self._captcha_ocr_text: str | None = None
        self._captcha_value: str | None = None
        self._captcha_attempts = 0
        self._captcha_required = False
        self._captcha_editable = False
        self._captcha_status: str | None = None

    async def __aenter__(self) -> TTDClient:
        self._captcha_event = asyncio.Event()
        self.context, self.page, self.scratch_dir = await BrowserContextFactory.launch(
            self.worker_id, self.headless, self.trace
        )

        def on_response(response) -> None:
            try:
                url = response.url.lower()
                if response.request.method == "POST" and "/dms/continue" in url:
                    self._last_continue_response_status = response.status
                    self._last_continue_response_at = time.monotonic()
                elif (
                    response.request.method == "POST" and "/wlpgpayment/razorpaymentdetails" in url
                ):
                    self._last_razorpay_details_response_status = response.status
                    self._last_razorpay_details_response_at = time.monotonic()
            except Exception:
                pass

        def on_request(request) -> None:
            try:
                url = request.url.lower()
                if request.method == "POST" and "/dms/" in url and "booking" in url:
                    self._last_booking_request_at = time.monotonic()
                elif request.method == "POST" and "/wlpgpayment/razorpaymentdetails" in url:
                    self._last_razorpay_details_request_at = time.monotonic()
            except Exception:
                pass

        self._response_listener = on_response
        self._request_listener = on_request
        self.page.on("response", on_response)
        self.page.on("request", on_request)

        if self.trace:
            if settings.ENVIRONMENT == "dev":
                _debug_folder = Path("debug") / self.task_id
                _debug_folder.mkdir(parents=True, exist_ok=True)
                _trace_dir = _debug_folder
            else:
                _trace_dir = self.scratch_dir

            self.trace_path = _trace_dir / "trace.zip"
            self._trace_started = True
            self.log.debug("Playwright tracing started via factory")
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        try:
            if self._response_listener is not None:
                self.page.off("response", self._response_listener)
            if self._request_listener is not None:
                self.page.off("request", self._request_listener)
        except Exception:
            pass

        if self._trace_started:
            try:
                await self.page.context.tracing.stop(path=self.trace_path)
                self._trace_started = False
            except Exception as trace_exc:
                self.log.warning("Could not finalize trace: {}", trace_exc)
        await BrowserContextFactory.cleanup(self.context, self.scratch_dir)

    # ------------------------------------------------------------------
    # Status helpers
    # ------------------------------------------------------------------
    def _emit_status(self, on_status: Callable[[str], None] | None, status: str) -> None:
        """Emit a status only when it actually changes (avoids log spam)."""
        if on_status is None:
            return
        if self._last_status == status:
            return
        self._last_status = status
        on_status(status)

    async def _read_logged_in_user(self) -> str:
        try:
            el = await self.page.query_selector(LOGGED_IN_USER_XPATH)
            if not el:
                return ""
            return (await el.text_content() or "").strip()
        except Exception:
            return ""

    async def get_status_snapshot(self) -> dict[str, Any]:
        """Return a consolidated status snapshot for centralized logging."""
        try:
            name_val = await self._field_value(NAME_INPUT_SELECTOR)
            age_val = await self._field_value(AGE_INPUT_SELECTOR)
            id_proof_val = await self._field_value(ID_PROOF_INPUT_SELECTOR)
            user = await self._read_logged_in_user()
            (
                release_text,
                server_text,
                seconds_remaining,
            ) = await self._read_release_clock()
            continue_enabled = await self._is_continue_enabled()
        except Exception as exc:
            self.log.debug("status snapshot failed: {}", exc)
            return {
                "filled": False,
                "user": "",
                "release_time": "",
                "server_time": "",
                "seconds_remaining": None,
                "continue_enabled": False,
                "status": self._last_status or "unknown",
                "error": str(exc),
            }

        return {
            "filled": bool(name_val and age_val and id_proof_val),
            "user": user,
            "release_time": release_text,
            "server_time": server_text,
            "seconds_remaining": seconds_remaining,
            "continue_enabled": continue_enabled,
            "status": self._last_status or "unknown",
        }

    # ------------------------------------------------------------------
    # Workflow
    # ------------------------------------------------------------------
    async def open_login(self) -> dict[str, Any]:
        """Open the login/booking page and return basic page state."""
        url = settings.TTD_FORM_URL or settings.TTD_LOGIN_URL
        self.log.info("Opening TTD form: {}", url)
        await self.page.goto(url, wait_until="domcontentloaded")
        await BrowserContextFactory.set_browser_zoom(self.page, zoom_percent=75)

        self.log.info(
            "Browser page loaded: title={!r} url={}",
            await self.page.title(),
            self.page.url,
        )
        return {"url": self.page.url, "title": await self.page.title()}

    async def wait_for_manual_form_fill(
        self,
        poll_interval: float = 0.5,
        on_status: Callable[[str], None] | None = None,
    ) -> None:
        """Legacy helper retained for compatibility; manual execution is trigger-driven now."""
        self.log.info("Waiting for {} to appear", CURRENT_FORM_SELECTOR)
        self._emit_status(on_status, "waiting_for_form")
        await self.page.wait_for_selector(CURRENT_FORM_SELECTOR, timeout=0)
        self.log.info("Form detected; validating all populated pilgrim entries")

        while True:
            pilgrim_count, valid, invalid_indices = await self._read_manual_pilgrim_state()

            if valid:
                self.log.info(
                    "Manual form fill complete: {} pilgrim(s) detected; waiting for release sync",
                    pilgrim_count,
                )
                self._emit_status(on_status, "filled")
                return

            if invalid_indices:
                self.log.debug(
                    "Manual pilgrim entries still incomplete/invalid: {}",
                    invalid_indices,
                )
            else:
                self.log.debug("Waiting for first manual pilgrim entry")

            self._emit_status(on_status, "filling")
            await asyncio.sleep(max(0.05, poll_interval))

    async def _field_value(self, selector: str) -> str:
        try:
            el = await self.page.query_selector(selector)
            if not el:
                return ""
            value = await el.get_attribute("value")
            return (value or "").strip()
        except Exception:
            return ""

    async def _is_logged_in(self) -> bool:
        """Return whether the portal currently exposes its authenticated logout control."""
        try:
            return await self.page.locator(LOGGED_IN_SELECTOR).first.is_visible()
        except Exception:
            return False

    async def _is_login_page_visible(self) -> bool:
        """Return whether the TTD login form is currently visible."""
        page = getattr(self, "page", None)

        if page is None or page.is_closed():
            return False

        try:
            username = page.locator(LOGIN_USERNAME_SELECTOR).first
            password = page.locator(LOGIN_PASSWORD_SELECTOR).first
            login_button = page.locator(LOGIN_BUTTON_SELECTOR).first

            form_visible = (
                await username.is_visible()
                and await password.is_visible()
                and await login_button.is_visible()
            )
            return form_visible or (
                not await self._is_logged_in() and await self._login_entry_control() is not None
            )
        except Exception:
            return False

    async def _login_entry_control(self):
        """Only recognize explicit login navigation, never arbitrary modal buttons."""
        for control in (
            self.page.get_by_role("button", name=LOGIN_ENTRY_NAME).first,
            self.page.get_by_role("link", name=LOGIN_ENTRY_NAME).first,
            self.page.locator('a[href*="userLogin"]').first,
        ):
            if await control.is_visible() and await control.is_enabled():
                return control
        return None

    async def _ensure_login_form(self) -> bool:
        """Reopen a returned login landing screen; false means already logged in."""
        deadline = time.monotonic() + 10
        clicks = 0
        next_click = 0.0
        while time.monotonic() < deadline:
            if self.page.is_closed():
                raise LoginFailedError("Browser was closed while waiting for login")
            if await self._is_logged_in():
                return False
            if (
                await self.page.locator(LOGIN_USERNAME_SELECTOR).first.is_visible()
                and await self.page.locator(LOGIN_PASSWORD_SELECTOR).first.is_visible()
            ):
                return True
            control = await self._login_entry_control()
            if control is not None and time.monotonic() >= next_click:
                if clicks >= NAVIGATION_CLICK_LIMIT:
                    break
                clicks += 1
                self.log.info("Opening login form (navigation attempt {})", clicks)
                try:
                    await control.click(timeout=1500)
                except PlaywrightTimeoutError:
                    self.log.warning("Login navigation did not finish; checking page state again")
                next_click = time.monotonic() + 1
            await self.page.wait_for_timeout(100)
        raise LoginFailedError("Login form did not appear after bounded navigation retries")

    def _can_restart_auto_flow(self) -> bool:
        """A restart is only safe before release/booking/payment submission begins."""
        return not any(
            (
                self._release_reached_logged,
                self._last_booking_request_at,
                self._payment_action_started,
                self._last_razorpay_details_request_at,
            )
        )

    async def _await_release_with_login_monitor(self, release_work):
        """Notice a returned login screen without changing the release scheduler."""
        task = asyncio.create_task(release_work)
        login_since = None
        try:
            while not task.done():
                done, _ = await asyncio.wait({task}, timeout=0.25)
                if done:
                    break
                snapshot = self._last_release_snapshot
                # No extra page inspection in the final three seconds or after
                # release/submission. The original timer and click path run intact.
                if not self._can_restart_auto_flow() or (
                    snapshot is not None and snapshot[2] is not None and snapshot[2] <= 3
                ):
                    login_since = None
                    continue
                if await self._is_login_page_visible():
                    if login_since is None:
                        login_since = time.monotonic()
                    elif time.monotonic() - login_since >= LOGIN_STABILITY_SECONDS:
                        raise AutoSessionExpiredError("login returned while awaiting release")
                else:
                    login_since = None
            return await task
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def _advance_auto_navigation(
        self, source_selector: str, target_selector: str, context: str
    ) -> None:
        """Retry only known preparation controls, after checking the destination."""
        for attempt in range(1, NAVIGATION_CLICK_LIMIT + 1):
            await self._require_auto_session(context)
            if await self.page.locator(target_selector).first.is_visible():
                return
            source = self.page.locator(source_selector).first
            if await source.is_visible() and await source.is_enabled():
                self.log.info(
                    "{}: navigation click {}/{}", context, attempt, NAVIGATION_CLICK_LIMIT
                )
                try:
                    await source.click(timeout=1500)
                except PlaywrightTimeoutError:
                    pass  # The destination, rather than click completion, confirms success.
            try:
                await self._wait_for_authenticated_transition(
                    target_selector, context, timeout_ms=3000
                )
                return
            except PlaywrightTimeoutError:
                self.log.warning("{}: destination missing; rechecking known controls", context)
        raise PlaywrightTimeoutError(f"{context}: navigation did not advance after bounded retries")

    async def _require_auto_session(self, context: str) -> None:
        """Confirm authentication while tolerating short Angular render gaps."""
        locator = self.page.locator(LOGGED_IN_SELECTOR).first
        deadline = time.monotonic() + 2.5
        login_started_at: float | None = None

        while time.monotonic() < deadline:
            try:
                if await locator.is_visible():
                    return
            except Exception:
                pass

            try:
                login_visible = await self._is_login_page_visible()
            except Exception:
                login_visible = False

            if login_visible:
                if login_started_at is None:
                    login_started_at = time.monotonic()
                elif time.monotonic() - login_started_at >= LOGIN_STABILITY_SECONDS:
                    break
            else:
                login_started_at = None

            await self.page.wait_for_timeout(25)

        self.log.warning(
            "Authenticated session is no longer confirmed during {}; restarting automatic flow",
            context,
        )
        raise AutoSessionExpiredError(context)

    async def _wait_for_authenticated_transition(
        self,
        target_selector: str,
        context: str,
        timeout_ms: int = 10_000,
    ) -> None:
        """Wait for the expected next menu/form and recognize a stable login view."""
        target = self.page.locator(target_selector).first
        deadline = time.monotonic() + timeout_ms / 1000.0
        login_started_at: float | None = None

        while time.monotonic() < deadline:
            try:
                if await target.is_visible():
                    await self._require_auto_session(context)
                    return
            except AutoSessionExpiredError:
                raise
            except Exception:
                pass

            try:
                login_visible = await self._is_login_page_visible()
            except Exception:
                login_visible = False

            if login_visible:
                if login_started_at is None:
                    login_started_at = time.monotonic()
                elif time.monotonic() - login_started_at >= LOGIN_STABILITY_SECONDS:
                    raise AutoSessionExpiredError(context)
            else:
                login_started_at = None

            await self.page.wait_for_timeout(25)

        await self._require_auto_session(context)
        raise PlaywrightTimeoutError(f"Expected page did not appear during {context}")

    async def _wait_for_post_continue_destination(self, *, auto: bool = False) -> None:
        """Wait for the payment view after Continue, tolerating TTD's home-screen flash."""
        deadline = time.monotonic() + POST_CONTINUE_TIMEOUT_SECONDS
        login_started_at: float | None = None
        home_notice_logged = False
        click_time = self._last_continue_click_at

        while time.monotonic() < deadline:
            now = time.monotonic()

            if (
                click_time
                and self._last_continue_response_at >= click_time
                and self._last_continue_response_status in {401, 403}
            ):
                message = f"/dms/continue returned HTTP {self._last_continue_response_status}"
                if auto:
                    raise AutoSessionExpiredError(message)
                raise PlaywrightTimeoutError(message)

            # Payment UI is terminal and wins over any intermediate route state.
            payment_ready = False
            try:
                payment_ready = await self.page.locator(PAY_NOW_BUTTON_XPATH).first.is_visible()
            except Exception:
                pass

            if not payment_ready:
                try:
                    payment_ready = await self.page.locator(RADIO_INPUT_SELECTOR).first.is_visible()
                except Exception:
                    pass

            if not payment_ready:
                try:
                    payment_ready = "srivanipay" in self.page.url.lower()
                except Exception:
                    pass

            if payment_ready:
                self.log.info("Payment page detected after Continue; proceeding")
                return

            # Only a stable login view is considered logout. A one-frame/short-lived
            # Angular route state must not restart the booking.
            try:
                login_visible = await self._is_login_page_visible()
            except Exception:
                login_visible = False

            if login_visible:
                if login_started_at is None:
                    login_started_at = now
                elif now - login_started_at >= LOGIN_STABILITY_SECONDS:
                    if auto:
                        raise AutoSessionExpiredError("stable login page appeared after Continue")
                    raise PlaywrightTimeoutError("Portal remained on the login page after Continue")
            else:
                login_started_at = None

            # Important observed case: the portal briefly renders the logged-in home page
            # before the payment route. This is explicitly non-terminal.
            if not home_notice_logged and await self._is_logged_in():
                home_notice_logged = True
                self.log.info(
                    "Logged-in home/dashboard detected during Continue transition; "
                    "waiting for payment page"
                )

            await self.page.wait_for_timeout(25)

        if await self._is_login_page_visible():
            if auto:
                raise AutoSessionExpiredError("login page remained visible after Continue")
            raise PlaywrightTimeoutError("Portal remained on the login page after Continue")

        raise PlaywrightTimeoutError(
            "Payment page did not become ready after Continue within "
            f"{POST_CONTINUE_TIMEOUT_SECONDS:.0f} seconds"
        )

    async def _read_manual_pilgrim_state(self) -> tuple[int, bool, list[int]]:
        """Inspect all populated current-booking pilgrim rows, not only pilgrim #1."""
        form = self.page.locator(CURRENT_FORM_SELECTOR).first
        state = await form.evaluate(
            r"""form => {
                const selectors = {
                    name: 'input[name^=\"fName\"]',
                    age: 'input[name^=\"age\"]',
                    gender: 'select[name^=\"gender\"]',
                    id_type: 'select[name^=\"proofS\"]',
                    id_doc: 'input[name^=\"proofId\"]'
                };

                const rows = {};
                const read = (selector, key) => {
                    for (const el of form.querySelectorAll(selector)) {
                        const match = (el.getAttribute('name') || '').match(/(\d+)$/);
                        if (!match) continue;
                        const index = Number(match[1]);
                        rows[index] ??= { present: false, fields: {} };
                        const value = String(el.value ?? '').trim();
                        rows[index].fields[key] = value;
                    }
                };

                read(selectors.name, 'name');
                read(selectors.age, 'age');
                read(selectors.gender, 'gender');
                read(selectors.id_type, 'id_type');
                read(selectors.id_doc, 'id_doc');

                for (const row of Object.values(rows)) {
                    row.present = Boolean(
                        row.fields.name || row.fields.age || row.fields.id_doc
                    );
                }

                return rows;
            }"""
        )

        active_indices: list[int] = []
        invalid_indices: list[int] = []

        for raw_index, row in state.items():
            index = int(raw_index)
            fields = row.get("fields", {})

            if index == 1 or row.get("present"):
                if row.get("present"):
                    active_indices.append(index)

                required_values = [
                    fields.get("name", ""),
                    fields.get("age", ""),
                    fields.get("id_doc", ""),
                ]

                # Only require optional controls when the form actually exposes them.
                for optional_key in ("gender", "id_type"):
                    if optional_key in fields:
                        required_values.append(fields[optional_key])

                age_value = fields.get("age", "")
                age_valid = age_value.isdigit() and 0 < int(age_value) <= 120
                gender_value = fields.get("gender", "").strip()
                id_type_value = fields.get("id_type", "").strip()
                gender_valid = "gender" not in fields or gender_value in {
                    value.strip() for value in GENDER_OPTION_VALUE.values()
                }
                id_type_valid = "id_type" not in fields or id_type_value in ID_TYPE_OPTION_LABEL
                if (
                    not all(required_values)
                    or not age_valid
                    or not gender_valid
                    or not id_type_valid
                ):
                    invalid_indices.append(index)

        active_indices.sort()
        invalid_indices.sort()
        return len(active_indices), not invalid_indices and bool(active_indices), invalid_indices

    async def _radio_selection_registered(self, target) -> bool:
        """Verify the native radio and the current/advance Angular payment model agree."""
        try:
            if not await target.is_checked():
                return False
        except Exception:
            return False

        try:
            state = await target.evaluate(
                r"""el => {
                    const angular = window.angular;
                    const expected = String(el.value ?? "").trim();
                    const result = {
                        ok: Boolean(el.checked),
                        model: null,
                        view: null,
                        scopeModel: null,
                        controllerAlias: null,
                    };
                    if (!angular) return { ...result, ok: false };

                    try {
                        const ngModel = angular.element(el).controller("ngModel");
                        if (ngModel) {
                            result.model = ngModel.$modelValue ?? null;
                            result.view = ngModel.$viewValue ?? null;
                        }

                        let scope = angular.element(el).scope();
                        for (let depth = 0; scope && depth < 20; depth++, scope = scope.$parent) {
                            for (const alias of ["ecspc", "sapc"]) {
                                const vm = scope[alias];
                                if (vm && Object.prototype.hasOwnProperty.call(vm, "bankValue")) {
                                    result.scopeModel = vm.bankValue ?? null;
                                    result.controllerAlias = alias;
                                    break;
                                }
                            }
                            if (result.controllerAlias) break;
                        }

                        const values = [result.model, result.view, result.scopeModel]
                            .filter(value => value !== null && value !== undefined)
                            .map(value => String(value).trim());

                        result.ok = Boolean(el.checked)
                            && result.controllerAlias !== null
                            && values.length > 0
                            && values.every(value => value === expected);
                    } catch (_) {
                        result.ok = false;
                    }
                    return result;
                }"""
            )
            if not state.get("ok"):
                return False
        except Exception:
            return False

        await self.page.wait_for_timeout(20)
        try:
            return await target.is_checked()
        except Exception:
            return False

    async def _payment_error_text(self) -> str:
        """Return the visible payment validation message, if any."""
        try:
            locator = self.page.locator(".err_epay p").first
            if not await locator.is_visible():
                return ""
            return (await locator.inner_text()).strip()
        except Exception:
            return ""

    async def _wait_for_payment_button_enabled(self, button) -> bool:
        """Wait for the actual enabled DOM state."""
        try:
            await button.wait_for(state="visible", timeout=15_000)
        except Exception:
            return False

        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            try:
                if await button.evaluate(
                    """el => {
                        if (!el) return false;
                        const style = getComputedStyle(el);
                        return !el.disabled
                            && el.getAttribute('aria-disabled') !== 'true'
                            && style.display !== 'none'
                            && style.visibility !== 'hidden'
                            && el.getClientRects().length > 0;
                    }"""
                ):
                    return True
            except Exception:
                pass
            await self.page.wait_for_timeout(HOT_POLL_MILLISECONDS)
        return False

    async def _text_content(self, selector: str) -> str:
        el = await self.page.query_selector(selector)
        if not el:
            return ""
        text = await el.text_content()
        return (text or "").strip()

    async def _is_continue_enabled(self) -> bool:
        try:
            locator = self.page.locator(CONTINUE_BUTTON_SELECTOR).first
            return await locator.evaluate(
                """el => {
                    if (!el) return false;
                    const style = window.getComputedStyle(el);
                    return !el.disabled
                        && el.getAttribute('aria-disabled') !== 'true'
                        && style.display !== 'none'
                        && style.visibility !== 'hidden'
                        && el.getClientRects().length > 0;
                }"""
            )
        except Exception:
            return False

    async def _click_continue_asap(self) -> bool:
        """Poll Continue closely and click on the first actionable DOM state."""
        deadline = time.monotonic() + 8.0

        while time.monotonic() < deadline:
            locator = self.page.locator(CONTINUE_BUTTON_SELECTOR).first
            try:
                if await self._is_continue_enabled():
                    self._last_continue_click_at = time.monotonic()
                    self._last_continue_response_status = None
                    self._last_continue_response_at = 0.0
                    await self.page.wait_for_timeout(800)
                    await locator.click(timeout=750, no_wait_after=True)
                    self.log.success("Continue clicked successfully")
                    return True
            except Exception as exc:
                self.log.debug("Continue click race; retrying: {}", exc)

            await self.page.wait_for_timeout(HOT_POLL_MILLISECONDS)

        return False

    async def _click_continue_asap_auto(self) -> bool:
        """Auto-mode Continue click with no auth work in the critical hot loop."""
        return await self._click_continue_asap()

    async def _read_release_clock(self) -> tuple[str, str, int | None]:
        release_text = await self._text_content(RELEASE_TIME_SELECTOR)
        server_text = await self._text_content(SERVER_TIME_SELECTOR)
        release_hms = _parse_hms(release_text)
        server_hms = _parse_hms(server_text)
        seconds_remaining = (
            _seconds_until_release(server_hms, release_hms) if release_hms and server_hms else None
        )
        return release_text, server_text, seconds_remaining

    def _should_emit_release_status(self, snapshot: tuple[str, str, int | None]) -> bool:
        """Emit only on meaningful transitions to avoid log spam.

        The central instance logger reports the periodic countdown; this method
        is reserved for one-off state changes (release reached, clock errors).
        """
        if snapshot == self._last_release_snapshot:
            return False
        return snapshot[2] == 0 or snapshot[2] is None

    async def log_release_status(self, *, force: bool = False) -> bool:
        """Read and log the portal release/server clocks.

        Returns True when the portal's server time has reached/passed the
        displayed release time.
        """
        release_text, server_text, seconds_remaining = await self._read_release_clock()
        snapshot = (release_text, server_text, seconds_remaining)

        if force or self._should_emit_release_status(snapshot):
            if seconds_remaining is None:
                self.log.error(
                    "Release clock unavailable: release_time={!r}, server_time={!r}",
                    release_text,
                    server_text,
                )
            else:
                self.log.info(
                    "Release sync: server_time={} release_time={} remaining={}s",
                    server_text,
                    release_text,
                    seconds_remaining,
                )
        self._last_release_snapshot = snapshot
        return _release_is_due(_parse_hms(server_text), _parse_hms(release_text))

    async def wait_for_release_and_continue(
        self,
        poll_interval: float | None = None,
        on_release_reached: Callable[[int], None] | None = None,
        on_release_confirmed: Callable[[int], None] | None = None,
    ) -> None:
        """Synchronize to release and click Continue immediately once enabled."""
        interval = max(0.05, poll_interval or settings.RELEASE_POLL_INTERVAL_SECONDS)
        previous_remaining: int | None = None
        release_reached = False

        self.log.info(
            "Starting release synchronization (poll={}s, status-log={}s)",
            interval,
            settings.RELEASE_STATUS_LOG_INTERVAL_SECONDS,
        )

        while True:
            try:
                release_text, server_text, seconds_remaining = await self._read_release_clock()
            except Exception as exc:
                self.log.exception("Failed to read release/server time selectors: {}", exc)
                await asyncio.sleep(interval)
                continue

            snapshot = (release_text, server_text, seconds_remaining)
            now = time.monotonic()

            if seconds_remaining is None:
                if self._should_emit_release_status(snapshot):
                    self.log.error(
                        "Cannot synchronize release time: release_time={!r}, server_time={!r}",
                        release_text,
                        server_text,
                    )
                self._last_release_snapshot = snapshot
                await asyncio.sleep(interval)
                continue

            due = _release_is_due(_parse_hms(server_text), _parse_hms(release_text))
            crossed_release = (
                previous_remaining is not None
                and previous_remaining <= 1
                and seconds_remaining > 3600
            )
            if due or seconds_remaining <= 0 or crossed_release:
                release_reached = True

            previous_remaining = seconds_remaining
            self._last_release_snapshot = snapshot

            if not release_reached:
                sleep_for = 0.05 if seconds_remaining <= 1 else interval
                if seconds_remaining > 1:
                    sleep_for = min(interval, max(0.05, seconds_remaining - 0.8))
                await asyncio.sleep(sleep_for)
                continue

            if not self._release_reached_logged:
                self._captcha_editable = False
                self._captcha_status = (
                    "release_reached" if self._captcha_image is not None else self._captcha_status
                )
                self._release_reached_logged = True
                self.log.info(
                    "Release time reached: server_time={} release_time={}; beginning Continue automation",
                    server_text,
                    release_text,
                )
                if on_release_reached:
                    on_release_reached(self.worker_id)

            if await self._click_continue_asap():
                if not self._continue_confirmation_logged:
                    self._continue_confirmation_logged = True
                    self.log.success(
                        "Continue clicked at release (server_time={} release_time={})",
                        server_text,
                        release_text,
                    )

                # TTD may flash the logged-in home/dashboard before payment.
                await self._wait_for_post_continue_destination(auto=False)

                if self._captcha_image is not None:
                    self._captcha_status = "submitted"
                if on_release_confirmed:
                    on_release_confirmed(self.worker_id)
                return

            if now - self._last_release_log_at >= max(
                1.0, settings.RELEASE_STATUS_LOG_INTERVAL_SECONDS
            ):
                self._last_release_log_at = now
                self.log.warning(
                    "Release reached, but Continue is not enabled yet; waiting "
                    "(server_time={} release_time={})",
                    server_text,
                    release_text,
                )

            await asyncio.sleep(0.05)

    async def select_radio_and_pay(
        self,
        gateway_id: str = PREFERRED_PAYMENT_GATEWAY_ID,
    ) -> bool:
        """Select the intended gateway and invoke TTD's existing prePayment handler once.

        This mirrors the working local override's important behavior: explicitly set
        the Angular controller's bankValue/bankName (rather than guessing a radio by
        index), then use the site's own prePayment() handler. The normal Pay Now control
        must already be visible and enabled. Once invocation starts, this method never
        retries it because a slow response can leave the first request's outcome unknown.

        True means the Razorpay checkout was observed opening; it does not mean payment
        completed or TTD recorded a successful booking.
        """
        gateway_id = str(gateway_id).strip()
        if not gateway_id:
            self.log.error("Payment gateway ID is empty; refusing payment initiation")
            return False

        if self._payment_action_started:
            self.log.error(
                "Payment initiation was already triggered for this browser session; refusing a duplicate"
            )
            return False

        radios = self.page.locator(RADIO_INPUT_SELECTOR)
        try:
            # The payment template renders its radio inputs before /common/banks
            # finishes. A visible input can therefore still have an empty value.
            await radios.first.wait_for(state="visible", timeout=30_000)
            await self.page.wait_for_function(
                r"""selector => {
                    const input = document.querySelector(selector);
                    const angular = window.angular;
                    if (!input || !angular) return false;
                    let scope = angular.element(input).scope();
                    for (let depth = 0; scope && depth < 25; depth++, scope = scope.$parent) {
                        for (const alias of ["ecspc", "sapc"]) {
                            const vm = scope[alias];
                            if (vm && Array.isArray(vm.bankList) && vm.bankList.length > 0) {
                                return true;
                            }
                        }
                    }
                    return false;
                }""",
                arg=RADIO_INPUT_SELECTOR,
                timeout=20_000,
            )
        except Exception as exc:
            try:
                debug_options = await radios.evaluate_all(
                    "els => els.map((el, index) => ({index, name: el.name, value: String(el.value ?? '').trim(), valueAttribute: el.getAttribute('value'), ngModel: el.getAttribute('ng-model')}))"
                )
            except Exception:
                debug_options = []
            self.log.error(
                "Payment gateway options did not finish loading; radio diagnostics={}; error={}",
                debug_options,
                exc,
            )
            return False

        try:
            bank_state = await radios.first.evaluate(
                r"""el => {
                    const angular = window.angular;
                    if (!angular) return { reason: "angular_unavailable" };
                    let scope = angular.element(el).scope();
                    for (let depth = 0; scope && depth < 25; depth++, scope = scope.$parent) {
                        for (const alias of ["ecspc", "sapc"]) {
                            const vm = scope[alias];
                            if (vm && Array.isArray(vm.bankList)) {
                                return {
                                    controllerAlias: alias,
                                    bankList: vm.bankList.map(item => ({
                                        pgId: String(item.pgId ?? "").trim(),
                                        paymentGatewayName: item.paymentGatewayName || item.bankName || item.name || null
                                    }))
                                };
                            }
                        }
                    }
                    return { reason: "payment_controller_not_found" };
                }"""
            )
            live_bank_list = bank_state.get("bankList") or []
            live_ids = [item.get("pgId", "") for item in live_bank_list if item.get("pgId")]
            if gateway_id not in live_ids:
                self.log.error(
                    "Configured payment gateway ID {} is not in the live controller bankList; live IDs={}, controller={}",
                    gateway_id,
                    live_ids,
                    bank_state.get("controllerAlias", bank_state.get("reason")),
                )
                return False

            # Use the DOM value property instead of a CSS [value="..."] selector.
            # AngularJS can update an input's live value before/without the original
            # attribute selector reflecting that binding consistently.
            await self.page.wait_for_function(
                r"""({selector, gatewayId}) => Array.from(document.querySelectorAll(selector))
                    .some(el => String(el.value ?? "").trim() === String(gatewayId))""",
                arg={"selector": RADIO_INPUT_SELECTOR, "gatewayId": gateway_id},
                timeout=5_000,
            )
            radio_options = await radios.evaluate_all(
                "els => els.map((el, index) => ({index, value: String(el.value ?? '').trim(), valueAttribute: el.getAttribute('value'), name: el.name, checked: el.checked}))"
            )
            target_index = next(
                index for index, item in enumerate(radio_options) if item.get("value") == gateway_id
            )
            target = radios.nth(target_index)
            await target.wait_for(state="attached", timeout=5_000)
            if not await target.is_enabled():
                self.log.error("Payment gateway ID {} is disabled by the portal", gateway_id)
                return False
        except Exception as exc:
            try:
                radio_options = await radios.evaluate_all(
                    "els => els.map((el, index) => ({index, value: String(el.value ?? '').trim(), valueAttribute: el.getAttribute('value'), name: el.name, ngModel: el.getAttribute('ng-model'), checked: el.checked}))"
                )
            except Exception:
                radio_options = []
            self.log.error(
                "Gateway ID {} exists in the live bank list but no matching radio value became available; live bank IDs={}, radio options={}, error={}",
                gateway_id,
                [item.get("pgId") for item in (bank_state.get("bankList") or [])],
                radio_options,
                exc,
            )
            return False

        # Use a real input event first, then explicitly synchronize the Angular model
        # like the working JS override. This is selection only; it does not submit a
        # booking or payment request.
        try:
            await target.check(force=True)
        except Exception as exc:
            self.log.debug("Native radio check did not complete cleanly: {}", exc)

        try:
            selection = await target.evaluate(
                r"""(el, gatewayId) => {
                    const angular = window.angular;
                    if (!angular) return { ok: false, reason: "angular_unavailable" };

                    let ownerScope = null;
                    let controller = null;
                    let controllerAlias = null;
                    let scope = angular.element(el).scope();

                    for (let depth = 0; scope && depth < 20; depth++, scope = scope.$parent) {
                        for (const alias of ["ecspc", "sapc"]) {
                            const vm = scope[alias];
                            if (vm && typeof vm.prePayment === "function"
                                && Object.prototype.hasOwnProperty.call(vm, "bankValue")) {
                                ownerScope = scope;
                                controller = vm;
                                controllerAlias = alias;
                                break;
                            }
                        }
                        if (controller) break;
                    }

                    if (!controller) {
                        return { ok: false, reason: "payment_controller_not_found" };
                    }
                    if (typeof controller.prePayment !== "function") {
                        return { ok: false, reason: "prePayment_handler_not_found" };
                    }

                    const banks = controller.bankList;
                    if (!Array.isArray(banks)) {
                        return { ok: false, reason: "bank_list_not_ready", controllerAlias };
                    }
                    const bank = banks.find(item => String(item.pgId) === String(gatewayId));
                    if (!bank) {
                        return { ok: false, reason: "gateway_not_in_live_bank_list", controllerAlias };
                    }

                    const sync = () => {
                        el.checked = true;
                        const ngModel = angular.element(el).controller("ngModel");
                        if (ngModel) ngModel.$setViewValue(String(gatewayId));
                        controller.bankValue = String(gatewayId);
                        ownerScope.bankName = String(gatewayId);
                        if (typeof ownerScope.selectedBank === "function") {
                            ownerScope.selectedBank(String(gatewayId));
                        }
                    };

                    if (ownerScope.$root && ownerScope.$root.$$phase) sync();
                    else ownerScope.$apply(sync);

                    return {
                        ok: String(controller.bankValue) === String(gatewayId)
                            && String(ownerScope.bankName) === String(gatewayId)
                            && Boolean(el.checked),
                        controllerAlias,
                        gatewayId: String(gatewayId),
                        bankName: bank.bankName || bank.name || null,
                        bankValue: String(controller.bankValue),
                        scopeBankName: String(ownerScope.bankName),
                    };
                }""",
                gateway_id,
            )
        except Exception as exc:
            self.log.error("Could not synchronize the payment gateway with Angular: {}", exc)
            return False

        if not selection.get("ok"):
            self.log.error(
                "Gateway selection rejected; reason={} alias={}",
                selection.get("reason", "model_mismatch"),
                selection.get("controllerAlias"),
            )
            return False

        if not await self._radio_selection_registered(target):
            self.log.error(
                "Native radio and Angular model do not agree for gateway ID {}; stopping before Pay Now",
                gateway_id,
            )
            return False

        self.log.success(
            "Payment gateway registered: alias={} id={} bank={!r}",
            selection.get("controllerAlias"),
            gateway_id,
            selection.get("bankName"),
        )

        pay_button = self.page.locator(PAY_NOW_BUTTON_XPATH).first
        if not await self._wait_for_payment_button_enabled(pay_button):
            self.log.error("Pay Now is not visible/enabled after gateway selection")
            return False

        # The page's own Pay Now action invokes this same handler. Calling the handler
        # after verifying the button is enabled avoids unreliable radio/click timing,
        # while still checking the same UI readiness. Protect the invocation as one-shot.
        self._last_booking_request_at = 0.0
        self._last_razorpay_details_request_at = 0.0
        self._last_razorpay_details_response_at = 0.0
        self._last_razorpay_details_response_status = None
        action_started = time.monotonic()
        self._payment_action_started = True

        try:
            invocation = await target.evaluate(
                r"""(el, gatewayId) => {
                    const angular = window.angular;
                    if (!angular) return { ok: false, invoked: false, reason: "angular_unavailable" };

                    let ownerScope = null;
                    let controller = null;
                    let controllerAlias = null;
                    let scope = angular.element(el).scope();

                    for (let depth = 0; scope && depth < 20; depth++, scope = scope.$parent) {
                        for (const alias of ["ecspc", "sapc"]) {
                            const vm = scope[alias];
                            if (vm && typeof vm.prePayment === "function"
                                && Object.prototype.hasOwnProperty.call(vm, "bankValue")) {
                                ownerScope = scope;
                                controller = vm;
                                controllerAlias = alias;
                                break;
                            }
                        }
                        if (controller) break;
                    }

                    if (!controller || !ownerScope) {
                        return { ok: false, invoked: false, reason: "payment_controller_not_found" };
                    }
                    if (controller.__ttdClientPaymentHandlerInvoked) {
                        return { ok: false, invoked: false, reason: "already_invoked" };
                    }
                    if (controller.hidebutton === true) {
                        return { ok: false, invoked: false, reason: "handler_busy" };
                    }
                    if (String(controller.bankValue) !== String(gatewayId)) {
                        return { ok: false, invoked: false, reason: "gateway_model_changed" };
                    }
                    const button = document.querySelector("button#edonation_paynow");
                    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
                        return { ok: false, invoked: false, reason: "pay_button_not_enabled" };
                    }

                    // Mark before calling the handler so even an uncertain page transition
                    // cannot trigger a second booking/payment attempt.
                    controller.__ttdClientPaymentHandlerInvoked = true;
                    const invoke = () => {
                        controller.bankValue = String(gatewayId);
                        ownerScope.bankName = String(gatewayId);
                        if (typeof ownerScope.selectedBank === "function") {
                            ownerScope.selectedBank(String(gatewayId));
                        }
                        controller.prePayment();
                    };

                    if (ownerScope.$root && ownerScope.$root.$$phase) invoke();
                    else ownerScope.$apply(invoke);

                    return { ok: true, invoked: true, controllerAlias, gatewayId: String(gatewayId) };
                }""",
                gateway_id,
            )
        except Exception as exc:
            self.log.error(
                "Could not confirm the result of the one-shot Pay Now handler invocation: {}. "
                "Do not retry automatically; inspect Network and booking status first.",
                exc,
            )
            return False

        if not invocation.get("invoked"):
            self.log.error(
                "Payment handler was not invoked; reason={}. No request was retried.",
                invocation.get("reason", "unknown"),
            )
            return False

        self.log.info(
            "Invoked native {}.prePayment() once for gateway ID {}; waiting for booking request",
            invocation.get("controllerAlias"),
            gateway_id,
        )

        # First confirm that the handler initiated the expected booking request.
        request_deadline = time.monotonic() + 8.0
        while time.monotonic() < request_deadline:
            if self._last_booking_request_at >= action_started:
                self.log.success("Pay Now handler initiated one booking request")
                break
            await self.page.wait_for_timeout(25)
        else:
            self.log.error(
                "No booking request was observed after the handler invocation. "
                "Its outcome may be uncertain, so no second attempt will be sent."
            )
            return False

        # Next confirm that TTD reached the Razorpay initialization endpoint.
        gateway_deadline = time.monotonic() + 20.0
        while time.monotonic() < gateway_deadline:
            if self._last_razorpay_details_request_at >= action_started:
                break
            await self.page.wait_for_timeout(50)
        else:
            self.log.error(
                "Booking request started, but no /wlpgpayment/razorpaymentDetails request was observed. "
                "Check the portal response and booking status; do not resubmit Pay Now."
            )
            return False

        response_deadline = time.monotonic() + 15.0
        while time.monotonic() < response_deadline:
            if self._last_razorpay_details_response_at >= self._last_razorpay_details_request_at:
                status = self._last_razorpay_details_response_status
                if status is not None and 200 <= status < 300:
                    break
                self.log.error(
                    "Razorpay initialization returned HTTP {}; checkout may not have opened",
                    status,
                )
                return False
            await self.page.wait_for_timeout(50)
        else:
            self.log.error(
                "Razorpay initialization response was not observed in time; no retry will be sent"
            )
            return False

        # Razorpay normally opens its checkout iframe/modal in the current TTD tab.
        checkout_selector = (
            'iframe[name="razorpay-checkout-frame"], '
            "iframe#razorpay-checkout-frame, "
            'iframe[src*="razorpay.com"], '
            ".razorpay-container, .razorpay-backdrop"
        )
        checkout_deadline = time.monotonic() + 8.0
        while time.monotonic() < checkout_deadline:
            try:
                checkout = self.page.locator(checkout_selector).first
                if await checkout.is_visible():
                    self.log.success(
                        "Razorpay checkout UI detected. Complete the payment manually and verify TTD history afterward."
                    )
                    return True
            except Exception:
                pass
            await self.page.wait_for_timeout(50)

        self.log.warning(
            "TTD returned a successful Razorpay initialization response, but the checkout UI was not detected. "
            "Inspect the page before taking any further action; no retry was sent."
        )
        return False

    async def show_browser(self) -> None:
        """Bring this task's browser page/window to the foreground when possible."""
        if not self.page or self.page.is_closed():
            raise RuntimeError("The browser page is no longer open")

        await self.page.bring_to_front()

        title = (await self.page.title()).strip()
        if not title:
            return

        await asyncio.to_thread(_focus_native_window, title)

    async def keep_alive_until_closed(self) -> None:
        """Block until the operator manually closes the browser window/page."""
        self.log.info("Instance staying alive until the browser is manually exited")
        while True:
            try:
                if self.page.is_closed():
                    self.log.info("Page closed by operator; instance exiting")
                    return
            except Exception as exc:
                self.log.exception("Error checking browser/page state: {}", exc)
                return
            await asyncio.sleep(1.0)

    async def execute(
        self,
        task: Task,
        on_status: Callable[[str], None] | None = None,
        release_gate: asyncio.Event | None = None,
        on_release_started: Callable[[int], None] | None = None,
        on_release_confirmed: Callable[[int], None] | None = None,
    ) -> dict[str, Any]:
        """Full manual workflow; operator trigger is the authoritative form-complete signal."""
        state = await self.open_login()

        # Manual mode is intentionally trigger-driven. The desktop runner owns the
        # release_gate and the operator presses Enter only after the form is ready.
        # Do NOT perform any client-side completion scan here.
        if release_gate is not None:
            self.log.info("Waiting for manual release trigger")
            self._emit_status(on_status, "ready_waiting_for_gate")
            await release_gate.wait()
            self.log.info(
                "Manual release trigger received; starting active portal-clock synchronization"
            )
        else:
            # Preserve the existing direct-call behavior: when there is no gate,
            # begin release synchronization immediately.
            self.log.info("No manual release gate supplied; starting release synchronization")

        await self.wait_for_release_and_continue(
            on_release_reached=on_release_started,
            on_release_confirmed=on_release_confirmed,
        )
        self._emit_status(on_status, "released")

        paid = await self.select_radio_and_pay()
        await self.keep_alive_until_closed()

        return {
            "provider": "ttd",
            "worker_id": self.worker_id,
            "state": state,
            "paid": paid,
            "message": "TTD manual-fill workflow completed.",
        }

    # ------------------------------------------------------------------
    # Fully-automated workflow
    # ------------------------------------------------------------------

    async def _get_future_booking_calendar(self) -> dict:
        url = "https://tirupatibalaji.ap.gov.in/dms/darshansummary"

        payload = {"channelTypeId": 100002, "darshanIdList": [100078], "roleName": "ROLE_PILGRIM"}

        headers = {
            "Accept": "application/json,text/plain,*/*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
            "Content-Type": "application/json",
            "Origin": "https://tirupatibalaji.ap.gov.in",
            "Priority": "u=0",
            "Referer": "https://tirupatibalaji.ap.gov.in/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "TE": "trailers",
            "ttd-auth-token": self.ttd_auth_token,  # Fixed hyphen to underscore for python syntax
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()  # Optional: raises an exception for 4xx/5xx errors
            return response.json()

    async def _get_login_success_flag(self) -> bool:
        """Submit login and allow a bounded wait for a slow authentication response."""
        try:
            async with self.page.expect_response(
                lambda r: "v1/authenticate" in r.url, timeout=10_000
            ) as resp_info:
                await self.page.click(LOGIN_BUTTON_SELECTOR, timeout=3000)

            resp = await resp_info.value
            resp_body = await resp.json()
            self.ttd_auth_token = resp.headers.get("ttd-auth-token")
            self.log.debug("TTD auth token received (value redacted)")
            return resp_body.get("loginSuccess", False)

        except PlaywrightTimeoutError:
            # Request was never fired—likely stopped client-side by Angular validation
            error_locator = self.page.locator(LOGIN_CAPTCHA_FAIL_SELECTOR)
            if await error_locator.count() > 0 and await error_locator.is_visible():
                err_text = await error_locator.inner_text()
                self.log.warning("Client-side validation blocked submission: {}", err_text.strip())
            else:
                self.log.warning("Login request never fired and no response was received.")

            return await self._is_logged_in()

    async def _solve_login_captcha(self) -> None:
        """Extract the login captcha <img> src, OCR it, and type it in."""
        captcha_el = await self.page.query_selector(LOGIN_CAPTCHA_IMG_SELECTOR)
        if not captcha_el:
            raise LoginFailedError(f"Captcha image not found: {LOGIN_CAPTCHA_IMG_SELECTOR}")

        src = await captcha_el.get_attribute("src")
        if not src:
            raise LoginFailedError("Captcha image has no src attribute")

        solved = ocr_image(src).upper()
        self.log.info("Login captcha OCR completed")

        await self.page.fill(LOGIN_CAPTCHA_INPUT_SELECTOR, solved)

    async def _refresh_login_captcha(self) -> None:
        try:
            refresh = self.page.locator(LOGIN_CAPTCHA_REFRESH_SELECTOR).first
            if await refresh.is_visible() and await refresh.is_enabled():
                await refresh.click(timeout=1500)
        except Exception as exc:
            self.log.warning("Could not click captcha refresh: {}", exc)

    async def login_auto(
        self, username: str, password: str, max_attempts: int | None = None
    ) -> None:
        """Log in automatically: fill credentials, solve the captcha via OCR,
        click Login, and confirm via response at `v1/authenticate`.

        Retries up to `max_attempts` times (default: settings.LOGIN_CAPTCHA_MAX_ATTEMPTS)
        refreshing the captcha between attempts, since OCR can misread the
        captcha text. Raises LoginFailedError if login could not be
        confirmed after all attempts.
        """
        max_attempts = max_attempts or settings.LOGIN_CAPTCHA_MAX_ATTEMPTS
        self.log.info("Auto-login starting for user={!r}", username)

        for attempt in range(1, max_attempts + 1):
            try:
                if not await self._ensure_login_form():
                    self.log.info("Authenticated page already visible; continuing")
                    return
                await self.page.fill(LOGIN_USERNAME_SELECTOR, username, timeout=5000)
                await self.page.fill(LOGIN_PASSWORD_SELECTOR, password, timeout=5000)
                self.log.info("Login attempt {}/{}: solving captcha", attempt, max_attempts)
                await self._solve_login_captcha()

                # Call helper which handles the click and response interception concurrently
                flag = await self._get_login_success_flag()

                if flag:
                    self.log.success(
                        "Auto-login confirmed (attempt {}/{})",
                        attempt,
                        max_attempts,
                    )
                    return

            except Exception as exc:
                self.log.warning(
                    "Login attempt {}/{} failed or not confirmed: {}; "
                    "rechecking login state before retrying",
                    attempt,
                    max_attempts,
                    exc,
                )
                if attempt < max_attempts:
                    await self._refresh_login_captcha()
                    continue
                raise LoginFailedError(f"Login submission failed: {exc}") from exc

            # If loginSuccess was explicitly false (and caught without throwing exception)
            self.log.warning(
                "Login attempt {}/{} not confirmed (loginSuccess=False); retrying",
                attempt,
                max_attempts,
            )
            if attempt < max_attempts:
                await self._refresh_login_captcha()

        raise LoginFailedError(
            f"Login could not be confirmed after {max_attempts} attempt(s) "
            f"(captcha OCR likely kept misreading)"
        )

    @staticmethod
    def _future_darshan_date_text(target_date: date, sel: bool = False) -> str:
        if sel:
            return target_date.strftime("%d-%m-%Y")
        return target_date.strftime("%d-%b-%Y")

    @classmethod
    def _future_darshan_day_selector(cls, target_date: date, status: str | None = None) -> str:
        date_text = cls._future_darshan_date_text(target_date, True)
        if status:
            return f'.{status}[class*="day {date_text}"]'
        return f'.day[class*="{date_text}"]'

    async def _open_future_darshan_calendar(self) -> None:
        await self.page.wait_for_selector(FUTURE_BREAK_DARSHAN_DATE_SELECTOR)
        calendar = self.page.locator(FUTURE_BREAK_DARSHAN_CALENDAR_SELECTOR)

        try:
            if await calendar.is_visible():
                return
        except Exception:
            pass

        await self.page.click(FUTURE_BREAK_DARSHAN_DATE_SELECTOR)
        await calendar.wait_for(state="visible", timeout=5_000)

    async def _close_future_darshan_calendar(self) -> None:
        calendar = self.page.locator(FUTURE_BREAK_DARSHAN_CALENDAR_SELECTOR)
        try:
            if not await calendar.is_visible():
                return
        except Exception:
            return

        close_button = self.page.locator(FUTURE_BREAK_DARSHAN_CALENDAR_CLOSE_SELECTOR).first
        try:
            await close_button.click()
            await calendar.wait_for(state="hidden", timeout=2_000)
        except Exception:
            # The portal may close the calendar itself after a selection or
            # after another Angular state transition. There is nothing else to
            # do when the overlay cannot be closed deterministically.
            return

    async def _click_future_darshan_calendar_date(
        self, target_date: date, *, forced: bool = False
    ) -> None:
        await self._open_future_darshan_calendar()

        date_text = self._future_darshan_date_text(target_date)

        # Only interact with the currently visible calendar modal.
        calendar = self.page.locator(f"{FUTURE_BREAK_DARSHAN_CALENDAR_SELECTOR}:visible").first

        await calendar.wait_for(state="visible", timeout=5_000)

        selector = self._future_darshan_day_selector(
            target_date,
            status=None if forced else "available",
        )

        target = calendar.locator(selector).first
        count = await target.count()

        self.log.info(
            "Looking for future Darshan date {}: selector={} matches={}",
            date_text,
            selector,
            count,
        )

        if count == 0:
            # Dump the visible calendar days so we can see the actual DOM/classes.
            days = calendar.locator('[class*="day"]')
            day_count = await days.count()

            self.log.warning(
                "Target date was not found. Visible calendar has {} day elements.",
                day_count,
            )

            for i in range(day_count):
                day = days.nth(i)
                self.log.info(
                    "Calendar day [{}]: text={!r} class={!r}",
                    i,
                    (await day.inner_text()).strip(),
                    await day.get_attribute("class"),
                )

            raise PlaywrightTimeoutError(
                f"Future Darshan date {date_text} not found in visible calendar"
            )

        date_input = self.page.locator(FUTURE_BREAK_DARSHAN_DATE_SELECTOR).first

        before_value = await date_input.input_value()

        await target.scroll_into_view_if_needed()

        self.log.info(
            "Clicking future Darshan date {}{}",
            date_text,
            " (forced)" if forced else "",
        )

        await target.click(force=forced)

        # Give Angular a moment to propagate the calendar selection.
        try:
            await self.page.wait_for_function(
                """({ selector, before }) => {
                    const input = document.querySelector(selector);
                    return input && input.value !== before;
                }""",
                {
                    "selector": FUTURE_BREAK_DARSHAN_DATE_SELECTOR,
                    "before": before_value,
                },
                timeout=3_000,
            )
        except Exception:
            actual_value = await date_input.input_value()

            self.log.warning(
                "Calendar click did not change date input. before={!r}, after={!r}",
                before_value,
                actual_value,
            )

            # Fallback for portals where the normal Playwright click does not
            # trigger the Angular handler correctly.
            await target.evaluate("(el) => el.click()")

            await self.page.wait_for_timeout(300)

        actual_value = await date_input.input_value()

        self.log.info(
            "Future Darshan date input after click: {!r}",
            actual_value,
        )

        confirm = self.page.locator(f"{FUTURE_BREAK_DARSHAN_CONFIRM_SELECTOR}:visible").first

        await confirm.wait_for(state="visible", timeout=5_000)
        await confirm.click()

        self.log.success(
            "Future Darshan date {} selected from calendar{}",
            date_text,
            " in forced mode" if forced else "",
        )

    async def _future_darshan_dom_status(self, target_date: date) -> str:
        """Return the portal's current CSS state for a requested calendar day."""
        for status, selector in (
            ("available", FUTURE_BREAK_DARSHAN_AVAILABLE_SELECTOR),
            ("unreleased", FUTURE_BREAK_DARSHAN_UNRELEASED_SELECTOR),
            ("booked", FUTURE_BREAK_DARSHAN_BOOKED_SELECTOR),
        ):
            locator = self.page.locator(
                f'{selector}[class*="day {self._future_darshan_date_text(target_date)}"]'
            )
            if await locator.count():
                return status

        day = self.page.locator(self._future_darshan_day_selector(target_date))
        if await day.count():
            return "other"
        return "missing"

    async def _set_future_darshan_date(
        self,
        target_dates: Sequence[date],
        *,
        forced: bool = False,
        poll_interval: float | None = None,
        timeout: float | None = None,
    ) -> date:
        """Select one requested future Darshan date from the real calendar UI.

        Normal mode waits until at least one requested date appears in the
        portal's ``availableDatesList`` and then selects that date through the
        calendar widget. Priority follows the order supplied by the user.

        Forced mode is intentionally a testing-only path: it clicks the first
        requested date directly using the generic ``.day`` selector, ignoring
        whether the portal currently marks the day as booked or unreleased.
        """
        requested: list[date] = []
        seen: set[date] = set()
        for value in target_dates:
            if value in seen:
                continue
            seen.add(value)
            requested.append(value)

        if not requested:
            raise ValueError("At least one future Darshan date must be requested")

        interval = (
            settings.FUTURE_DARSHAN_POLL_INTERVAL_SECONDS
            if poll_interval is None
            else poll_interval
        )
        interval = max(0.25, interval)

        if forced:
            await self._open_future_darshan_calendar()
            for candidate in requested:
                try:
                    await self._click_future_darshan_calendar_date(candidate, forced=True)
                    return candidate
                except PlaywrightTimeoutError:
                    status = await self._future_darshan_dom_status(candidate)
                    self.log.warning(
                        "Forced future Darshan date {} was not present in the calendar DOM (status={}); trying next requested date",
                        self._future_darshan_date_text(candidate),
                        status,
                    )
                except Exception as exc:
                    self.log.warning(
                        "Forced future Darshan date {} could not be selected: {}; trying next requested date",
                        self._future_darshan_date_text(candidate),
                        exc,
                    )
            raise ValueError(
                "None of the requested future Darshan dates could be selected in forced mode"
            )

        started_at = time.monotonic()
        last_logged_status: tuple[tuple[str, str], ...] | None = None

        while True:
            await self._require_auto_session("future Darshan availability check")
            try:
                calendar = await self._get_future_booking_calendar()
            except Exception as exc:
                self.log.warning("Could not read future Darshan calendar: {}", exc)
                calendar = {}

            available_values = {
                str(value).strip() for value in (calendar.get("availableDatesList") or []) if value
            }

            selected = next(
                (
                    candidate
                    for candidate in requested
                    if self._future_darshan_date_text(candidate) in available_values
                ),
                None,
            )

            if selected is not None:
                try:
                    # Re-open the calendar before the click so the DOM reflects
                    # the latest Angular calendar state after the API poll.
                    await self._close_future_darshan_calendar()
                    await self._click_future_darshan_calendar_date(selected)
                    return selected
                except Exception as exc:
                    self.log.warning(
                        "Calendar reported {} available, but UI selection failed: {}; retrying",
                        self._future_darshan_date_text(selected),
                        exc,
                    )
                    await self._close_future_darshan_calendar()

            # Report useful state transitions without flooding the task log.
            try:
                await self._open_future_darshan_calendar()
                statuses = tuple(
                    (
                        self._future_darshan_date_text(candidate),
                        await self._future_darshan_dom_status(candidate),
                    )
                    for candidate in requested
                )
            except Exception:
                statuses = tuple(
                    (self._future_darshan_date_text(candidate), "unknown")
                    for candidate in requested
                )

            if statuses != last_logged_status:
                last_logged_status = statuses
                self.log.info("Future Darshan requested-date status: {}", dict(statuses))

            if timeout is not None and time.monotonic() - started_at >= timeout:
                raise TimeoutError(
                    "Timed out waiting for any requested future Darshan date to become available"
                )

            await self._close_future_darshan_calendar()
            await asyncio.sleep(interval)

    async def donate_auto(
        self,
        donation: int,
        *,
        booking_type: str = "current",
        future_booking_dates: Sequence[date] | None = None,
        future_booking_forced: bool = False,
        additional_laddus: int = -1,
    ) -> date | None:
        """Navigate to donations and select the requested booking type."""
        await self._require_auto_session("before donations navigation")
        _donation_transition_timeout = 1500
        self.log.info(
            "Navigating to donations page in {}ms: {}", _donation_transition_timeout, DONATIONS_URL
        )
        await self.page.wait_for_timeout(_donation_transition_timeout)
        await self.page.goto(DONATIONS_URL, wait_until="domcontentloaded")

        self.log.info("Clicking initial Continue on donations page")
        await self._wait_for_authenticated_transition(
            CONTINUE_BUTTON_SELECTOR,
            "donations page loaded",
        )
        await self._advance_auto_navigation(
            CONTINUE_BUTTON_SELECTOR,
            DONATION_AMOUNT_SELECTOR,
            "donation amount page after initial Continue",
        )
        self.log.info("Entering donation amount: {}", donation)
        await self._require_auto_session("before donation amount entry")
        await self.page.fill(DONATION_AMOUNT_SELECTOR, str(donation))

        self.log.info("Checking donation confirmation checkboxes")
        await self._require_auto_session("before donation confirmation")
        await self.page.check(DONATION_CHECK_AMOUNT_SELECTOR)
        await self.page.check(DONATION_CHECK_INDIAN_SELECTOR)

        self.log.info("Clicking Continue after donation entry")
        await self._require_auto_session("before donation Continue")
        await self._advance_auto_navigation(
            CONTINUE_BUTTON_SELECTOR,
            CURRENT_BOOKING_BUTTON_SELECTOR
            if booking_type == "current"
            else FUTURE_BOOKING_BUTTON_SELECTOR,
            "booking menu after donation Continue",
        )

        if booking_type == "current":
            self.log.info("Clicking 'current booking'")
            await self._wait_for_authenticated_transition(
                CURRENT_BOOKING_BUTTON_SELECTOR,
                "current booking menu after donation Continue",
            )
            await self._advance_auto_navigation(
                CURRENT_BOOKING_BUTTON_SELECTOR,
                CURRENT_CONFIRM_YES_BUTTON_SELECTOR,
                "current booking confirmation",
            )
            self.log.info("Confirming current booking (Yes)")
            await self._advance_auto_navigation(
                CURRENT_CONFIRM_YES_BUTTON_SELECTOR,
                CURRENT_FORM_SELECTOR,
                "pilgrim-details menu after current booking confirmation",
            )
            return None

        if booking_type == "future":
            requested_dates = list(future_booking_dates or [])
            if not requested_dates:
                raise ValueError("future_booking_dates is required for future booking.")

            if not 1 <= additional_laddus <= 999:
                raise ValueError("additional_laddus must be between 1 and 999 for future booking.")

            self.log.info(
                "Future Darshan target dates: {}{}",
                [self._future_darshan_date_text(value) for value in requested_dates],
                " (forced testing mode)" if future_booking_forced else "",
            )

            self.log.info("Clicking 'future booking'")
            await self._wait_for_authenticated_transition(
                FUTURE_BOOKING_BUTTON_SELECTOR,
                "future booking menu",
            )
            await self._advance_auto_navigation(
                FUTURE_BOOKING_BUTTON_SELECTOR,
                FUTURE_CONFIRM_CHECKBOX_SELECTOR,
                "future booking confirmation checkbox",
            )
            await self.page.check(FUTURE_CONFIRM_CHECKBOX_SELECTOR)

            self.log.info("Confirming future booking (Yes)")
            await self._wait_for_authenticated_transition(
                FUTURE_CONFIRM_YES_BUTTON_SELECTOR,
                "before future booking confirmation",
            )
            await self._advance_auto_navigation(
                FUTURE_CONFIRM_YES_BUTTON_SELECTOR,
                FUTURE_BREAK_DARSHAN_CHECK,
                "Break Darshan menu after future booking confirmation",
            )
            await self.page.check(FUTURE_BREAK_DARSHAN_CHECK)
            await self._require_auto_session("after Break Darshan selection")

            await self._require_auto_session("before future Darshan date selection")
            selected_date = await self._set_future_darshan_date(
                requested_dates,
                forced=future_booking_forced,
            )
            await self._require_auto_session("after future Darshan date selection")

            self.log.info("Setting additional laddus: {}", additional_laddus)
            await self._wait_for_authenticated_transition(
                FUTURE_BREAK_DARSHAN_ADDITIONAL_LADDUS,
                "additional laddu entry",
            )
            await self.page.fill(FUTURE_BREAK_DARSHAN_ADDITIONAL_LADDUS, str(additional_laddus))
            await self._require_auto_session("after additional laddu entry")
            return selected_date

        raise ValueError(
            f"Unsupported booking_type: {booking_type!r}. Expected 'current' or 'future'."
        )

    @property
    def captcha_required(self) -> bool:
        return self._captcha_required

    @property
    def captcha_status(self) -> str | None:
        return self._captcha_status

    @property
    def captcha_attempts(self) -> int:
        return self._captcha_attempts

    @property
    def captcha_max_attempts(self) -> int:
        return settings.LOGIN_CAPTCHA_MAX_ATTEMPTS

    def get_captcha_state(self) -> dict[str, Any]:
        image_base64 = (
            base64.b64encode(self._captcha_image).decode("ascii")
            if self._captcha_image is not None
            else None
        )
        return {
            "available": self._captcha_image is not None,
            "required": self._captcha_required,
            "editable": self._captcha_editable,
            "status": self._captcha_status,
            "ocr_text": self._captcha_ocr_text,
            "value": self._captcha_value,
            "attempts": self._captcha_attempts,
            "max_attempts": settings.LOGIN_CAPTCHA_MAX_ATTEMPTS,
            "image_base64": image_base64,
        }

    async def submit_pilgrim_captcha(self, value: str) -> None:
        """Apply a CAPTCHA value from the control UI.

        A successful OCR result is editable without blocking the booking. If
        OCR exhausted its attempts, this same operation is used to satisfy the
        mandatory human-review gate.
        """
        normalized = value.strip().upper()
        if len(normalized) != 6 or not normalized.isalnum():
            raise ValueError("captcha must be exactly 6 letters/numbers")
        if not self._captcha_editable:
            raise RuntimeError("CAPTCHA is no longer editable")

        await self.page.fill(CURRENT_PILGRIM_CAPTCHA_TEXT, normalized)
        self._captcha_value = normalized

        if self._captcha_required:
            self._captcha_required = False
            self._captcha_editable = False
            self._captcha_status = "submitted"
            if self._captcha_event is None:
                raise RuntimeError("CAPTCHA coordination event is not initialized")
            self._captcha_event.set()
            self.log.info("Current-booking CAPTCHA submitted from central UI")
        else:
            self._captcha_status = "edited"
            self.log.info("Current-booking CAPTCHA corrected from central UI")

    async def _solve_pilgrim_captcha(self) -> str | None:
        canvas_el = await self.page.query_selector(CURRENT_PILGRIM_CAPTCHA_CANVAS_SELECTOR)
        if not canvas_el:
            self.log.debug(
                "No pilgrim-details captcha canvas found (selector={})",
                CURRENT_PILGRIM_CAPTCHA_CANVAS_SELECTOR,
            )
            self._captcha_image = None
            self._captcha_ocr_text = None
            return None

        # Read the raw canvas backing store. This is zoom- and DPI-independent,
        # unlike ElementHandle.screenshot() which rasterizes the rendered (and
        # therefore zoomed) region.
        data_url = await canvas_el.evaluate("canvas => canvas.toDataURL('image/png')")
        if not data_url or not data_url.startswith("data:image/png;base64,"):
            self.log.warning("CAPTCHA canvas returned no data URL")
            self._captcha_image = None
            self._captcha_ocr_text = None
            return None

        self._captcha_image = base64.b64decode(data_url.split(",", 1)[1])
        solved = ocr_image(self._captcha_image).upper().strip()
        self._captcha_ocr_text = solved or None
        self._captcha_value = solved or None
        self._captcha_attempts += 1
        self.log.info("Pilgrim-details CAPTCHA OCR completed")
        return solved or None

    async def fill_pilgrim_details_auto(
        self,
        pilgrim_details: list[dict[str, Any]],
        *,
        start_index: int = 1,
        form_selector: str = CURRENT_FORM_SELECTOR,
        passport_alert_selector: str = CURRENT_PILGIRM_PASSPORT_ALERT_SELECTOR,
        captcha: bool = True,
    ) -> None:
        """Fill pilgrim details using the portal's serial numbering scheme.

        Current booking starts at 1; future booking starts at 0.
        """
        if len(pilgrim_details) > MAX_PILGRIMS_PER_BOOKING:
            raise ValueError(
                f"Got {len(pilgrim_details)} pilgrims, but only "
                f"{MAX_PILGRIMS_PER_BOOKING} are supported per booking"
            )

        await self._require_auto_session("before pilgrim details form")
        self.log.info("Waiting for pilgrim details form to appear")
        await self._wait_for_authenticated_transition(form_selector, "pilgrim details form")

        for n, pilgrim in enumerate(pilgrim_details, start=start_index):
            await self._require_auto_session(f"before filling pilgrim {n}")
            self.log.info(
                "Filling pilgrim {}/{}: name={!r} age={} gender={} id_type={}",
                n,
                len(pilgrim_details),
                pilgrim["name"],
                pilgrim["age"],
                pilgrim["gender"],
                pilgrim["id_type"],
            )

            await self.page.fill(PILGRIM_NAME_TEMPLATE.format(n=n), pilgrim["name"])
            await self.page.fill(PILGRIM_AGE_TEMPLATE.format(n=n), str(pilgrim["age"]))

            gender_value = GENDER_OPTION_VALUE[pilgrim["gender"]]
            await self.page.select_option(
                PILGRIM_GENDER_SELECT_TEMPLATE.format(n=n), value=gender_value
            )

            id_type_label = ID_TYPE_OPTION_LABEL[pilgrim["id_type"]]
            self.log.info("ID LABEL: {}", id_type_label)
            await self.page.select_option(
                PILGRIM_ID_TYPE_SELECT_TEMPLATE.format(n=n), label=id_type_label
            )
            self.log.info("Code passthru check")

            # Suppress alert popup when attempting passport id type.
            if id_type_label.strip() == "Passport":
                self.log.info(
                    "Passport Alert Popup using selector {}",
                    passport_alert_selector,
                )
                await self.page.wait_for_selector(passport_alert_selector)
                await self.page.click(passport_alert_selector)

            await self.page.fill(
                PILGRIM_ID_DOC_NUMBER_TEMPLATE.format(n=n), pilgrim["id_doc_number"]
            )
            self.log.info("Filled pilgrim document number")
            await self._require_auto_session(f"after filling pilgrim {n}")

        self.log.success("Pilgrim details filled for {} pilgrim(s)", len(pilgrim_details))

        if captcha:
            self._captcha_attempts = 0
            self._captcha_image = None
            self._captcha_ocr_text = None
            self._captcha_value = None
            self._captcha_required = False
            self._captcha_editable = False
            self._captcha_status = "processing"
            if self._captcha_event is None:
                self._captcha_event = asyncio.Event()
            self._captcha_event.clear()

            captcha_text = None
            max_attempts = settings.LOGIN_CAPTCHA_MAX_ATTEMPTS
            for attempt in range(1, max_attempts + 1):
                captcha_text = await self._solve_pilgrim_captcha()
                self.log.info(
                    "CAPTCHA OCR attempt {}/{} produced {!r}",
                    attempt,
                    max_attempts,
                    captcha_text,
                )

                if captcha_text and len(captcha_text) == 6:
                    break

                if attempt < max_attempts:
                    try:
                        await self.page.click(CURRENT_PILGRIM_CAPTCHA_REFRESH_SELECTOR)
                    except Exception as exc:
                        self.log.warning("Could not refresh pilgrim CAPTCHA: {}", exc)

            if captcha_text and len(captcha_text) == 6:
                await self.page.fill(CURRENT_PILGRIM_CAPTCHA_TEXT, captcha_text)
                self._captcha_value = captcha_text
                self._captcha_required = False
                self._captcha_editable = True
                self._captcha_status = "ocr_succeeded"
                self.log.success(
                    "Pilgrim-details CAPTCHA OCR completed with candidate {!r}; continuing to release synchronization.",
                    captcha_text,
                )
            else:
                await self.page.fill(CURRENT_PILGRIM_CAPTCHA_TEXT, "")
                self._captcha_required = True
                self._captcha_editable = True
                self._captcha_status = "waiting_for_review"
                self.log.warning(
                    "CAPTCHA OCR exhausted {} attempt(s) without a valid 6-character value; waiting for operator review.",
                    max_attempts,
                )
                await self._captcha_event.wait()
                self.log.success("Current-booking CAPTCHA review completed")

    async def check_quota_alert(self) -> str | None:
        """Return the quota alert's text if the 'quota not yet released'
        modal is showing, else None."""
        try:
            locator = (
                self.page.locator(QUOTA_ALERT_SELECTOR)
                .filter(has_text=QUOTA_NOT_RELEASED_TEXT)
                .first
            )
            if not await locator.is_visible():
                return None
            text = (await locator.inner_text()).strip()
            return text or None
        except Exception:
            return None

    async def wait_for_release_and_continue_auto(
        self,
        poll_interval: float | None = None,
        on_release_reached: Callable[[int], None] | None = None,
        on_release_confirmed: Callable[[int], None] | None = None,
    ) -> None:
        """Synchronize release and click Continue with no auth work in the hot path."""
        interval = max(0.05, poll_interval or settings.RELEASE_POLL_INTERVAL_SECONDS)
        previous_remaining: int | None = None
        release_reached = False
        next_session_check = 0.0

        await self._require_auto_session("before release synchronization")

        if self._captcha_image is not None and not self._captcha_required:
            self._captcha_status = "release_sync"

        while True:
            release_text, server_text, seconds_remaining = await self._read_release_clock()
            snapshot = (release_text, server_text, seconds_remaining)
            now = time.monotonic()

            if (
                not release_reached
                and seconds_remaining is not None
                and seconds_remaining > 3
                and now >= next_session_check
            ):
                await self._require_auto_session("release synchronization")
                next_session_check = now + 1.0

            if seconds_remaining is None:
                if self._should_emit_release_status(snapshot):
                    self.log.error(
                        "Cannot synchronize release time: release_time={!r}, server_time={!r}",
                        release_text,
                        server_text,
                    )
                self._last_release_snapshot = snapshot
                await asyncio.sleep(interval)
                continue

            due = _release_is_due(_parse_hms(server_text), _parse_hms(release_text))
            crossed_release = (
                previous_remaining is not None
                and previous_remaining <= 1
                and seconds_remaining > 3600
            )
            if due or seconds_remaining <= 0 or crossed_release:
                release_reached = True

            previous_remaining = seconds_remaining
            self._last_release_snapshot = snapshot

            if not release_reached:
                sleep_for = 0.05 if seconds_remaining <= 1 else interval
                if seconds_remaining > 1:
                    sleep_for = min(interval, max(0.05, seconds_remaining - 0.8))
                await asyncio.sleep(sleep_for)
                continue

            if not self._release_reached_logged:
                self._release_reached_logged = True
                self.log.info(
                    "Auto release reached: server_time={} release_time={}; waiting for Continue to become enabled",
                    server_text,
                    release_text,
                )
                if on_release_reached:
                    on_release_reached(self.worker_id)

            # Critical section: no session check between enabled detection and click.
            if await self._click_continue_asap_auto():
                if not self._continue_confirmation_logged:
                    self._continue_confirmation_logged = True
                    self.log.success(
                        "Auto Continue clicked at release (server_time={} release_time={})",
                        server_text,
                        release_text,
                    )

                # TTD may show the logged-in home/dashboard for a moment before payment.
                await self._wait_for_post_continue_destination(auto=True)

                alert_text = await self.check_quota_alert()
                if alert_text and QUOTA_NOT_RELEASED_TEXT in alert_text:
                    self.log.error(
                        "Quota-not-released alert shown after Continue: {!r}",
                        alert_text,
                    )
                    raise QuotaNotReleasedError(alert_text)
                if alert_text:
                    self.log.warning("Unexpected modal after Continue: {!r}", alert_text)

                if on_release_confirmed:
                    on_release_confirmed(self.worker_id)
                return

            if now - self._last_release_log_at >= max(
                1.0, settings.RELEASE_STATUS_LOG_INTERVAL_SECONDS
            ):
                self._last_release_log_at = now
                self.log.warning(
                    "Release reached, but Continue is not enabled yet; still waiting "
                    "(server_time={} release_time={})",
                    server_text,
                    release_text,
                )

            await asyncio.sleep(0.05)

    async def execute_auto(
        self,
        task: Task,
        on_release_started: Callable[[int], None] | None = None,
        on_release_confirmed: Callable[[int], None] | None = None,
    ) -> dict[str, Any]:
        """Run the fully automatic workflow, restarting from login if the session expires."""
        booking = task.payload
        username = booking["username"]
        password = booking["password"]
        donation = booking["donation"]
        pilgrim_details = booking["pilgrim_details"]
        booking_type = booking.get("booking_type", "current")
        future_booking_dates = booking.get("future_booking_dates", [])
        future_booking_forced = bool(booking.get("future_booking_forced", False))
        additional_laddus = booking.get("additional_laddus", -1)

        self.log.info(
            "Starting fully-automated booking: user={!r} donation={} "
            "booking_type={} future_booking_dates={} future_booking_forced={} "
            "additional_laddus={} pilgrims={}",
            username,
            donation,
            booking_type,
            future_booking_dates,
            future_booking_forced,
            additional_laddus,
            len(pilgrim_details),
        )

        restart_count = 0

        while True:
            future_submission_started = False
            self._release_reached_logged = False
            self._continue_confirmation_logged = False
            self._last_release_snapshot = None
            self._last_release_log_at = 0.0
            self.ttd_auth_token = None
            self._last_continue_response_status = None
            self._last_continue_response_at = 0.0
            self._last_continue_click_at = 0.0
            self._last_booking_request_at = 0.0
            self._payment_action_started = False
            self._last_razorpay_details_request_at = 0.0
            self._last_razorpay_details_response_at = 0.0
            self._last_razorpay_details_response_status = None
            try:
                state = await self.open_login()
                await self.login_auto(username, password)
                await self._require_auto_session("post-login")

                # Keep the same navigation sequence, but verify authentication
                # before and after every donation-page transition.
                selected_future_booking_date = await self.donate_auto(
                    donation,
                    booking_type=booking_type,
                    future_booking_dates=future_booking_dates,
                    future_booking_forced=future_booking_forced,
                    additional_laddus=additional_laddus,
                )

                if selected_future_booking_date is not None:
                    task.payload["future_booking_date"] = selected_future_booking_date.isoformat()

                await self._require_auto_session("before pilgrim details")

                if booking_type == "current":
                    await self.fill_pilgrim_details_auto(
                        pilgrim_details,
                        start_index=1,
                        form_selector=CURRENT_FORM_SELECTOR,
                        passport_alert_selector=CURRENT_PILGIRM_PASSPORT_ALERT_SELECTOR,
                        captcha=True,
                    )
                else:
                    await self.fill_pilgrim_details_auto(
                        pilgrim_details,
                        start_index=0,
                        form_selector=FUTURE_FORM_SELECTOR,
                        passport_alert_selector=FUTURE_PILGIRM_PASSPORT_ALERT_SELECTOR,
                        captcha=False,
                    )

                await self._require_auto_session("after pilgrim details")

                if booking_type == "current":
                    try:
                        await self._await_release_with_login_monitor(
                            self.wait_for_release_and_continue_auto(
                                on_release_reached=on_release_started,
                                on_release_confirmed=on_release_confirmed,
                            )
                        )
                    except QuotaNotReleasedError as exc:
                        self.log.error(
                            "Booking failed: portal reported quota not yet released. "
                            "Browser instance will stay open for inspection."
                        )
                        await self.keep_alive_until_closed()
                        return {
                            "provider": "ttd",
                            "worker_id": self.worker_id,
                            "state": state,
                            "paid": False,
                            "success": False,
                            "failure_reason": "quota_not_released",
                            "message": str(exc),
                        }
                else:
                    await self._require_auto_session("future booking Continue")
                    future_continue = self.page.locator(FUTURE_CONTINUE_BTN).first
                    await future_continue.wait_for(state="visible", timeout=10_000)
                    deadline = time.monotonic() + 5.0
                    while time.monotonic() < deadline:
                        try:
                            if await future_continue.is_enabled():
                                future_submission_started = True
                                self._last_continue_click_at = time.monotonic()
                                self._last_continue_response_status = None
                                self._last_continue_response_at = 0.0
                                await future_continue.click(timeout=750, no_wait_after=True)
                                break
                        except Exception:
                            pass
                        await self.page.wait_for_timeout(HOT_POLL_MILLISECONDS)
                    else:
                        raise PlaywrightTimeoutError("Future booking Continue never became enabled")
                    await self._wait_for_post_continue_destination(auto=True)

                paid = await self.select_radio_and_pay()
                if paid:
                    self.log.success(
                        "Automated flow reached the payment gateway; operator should "
                        "complete payment manually, then close the browser"
                    )
                else:
                    self.log.error(
                        "Automated flow could not reach/click Pay Now automatically; "
                        "operator should finish manually in the browser window"
                    )

                await self.keep_alive_until_closed()

                return {
                    "provider": "ttd",
                    "worker_id": self.worker_id,
                    "state": state,
                    "paid": paid,
                    "success": True,
                    "future_booking_date": (
                        selected_future_booking_date.isoformat()
                        if selected_future_booking_date is not None
                        else None
                    ),
                    "future_booking_dates": [
                        value.isoformat() if isinstance(value, date) else str(value)
                        for value in future_booking_dates
                    ],
                    "future_booking_forced": future_booking_forced,
                    "message": "TTD fully-automated workflow completed; awaiting manual payment gateway completion.",
                }

            except (AutoSessionExpiredError, PlaywrightTimeoutError) as exc:
                if future_submission_started or not self._can_restart_auto_flow():
                    self.log.error(
                        "Recovery stopped after booking/payment may have started: {}", exc
                    )
                    raise
                if self.page.is_closed() or restart_count >= AUTO_RECOVERY_LIMIT:
                    self.log.error(
                        "Automatic recovery stopped: browser closed or retry limit reached"
                    )
                    raise
                restart_count += 1
                self.log.warning(
                    "Recoverable page/session interruption (restart #{}; context={}); "
                    "returning to login and restarting the complete flow",
                    restart_count,
                    exc,
                )
                self._captcha_event = asyncio.Event()
                self._captcha_required = False
                self._captcha_editable = False
                self._captcha_image = None
                self._captcha_ocr_text = None
                self._captcha_value = None
                self._captcha_status = None
                await asyncio.sleep(0.1)
                continue
