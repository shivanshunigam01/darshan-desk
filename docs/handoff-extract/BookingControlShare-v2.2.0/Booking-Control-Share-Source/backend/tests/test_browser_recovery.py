from __future__ import annotations

import asyncio
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.ttd.client import (
    AUTO_RECOVERY_LIMIT,
    LOGIN_CAPTCHA_INPUT_SELECTOR,
    AutoSessionExpiredError,
    PlaywrightTimeoutError,
    TTDClient,
)


def client():
    return TTDClient("recovery-test", 0)


def test_returned_login_button_opens_form_before_filling():
    c = client()
    state = {"form": False}
    field = SimpleNamespace(is_visible=AsyncMock(side_effect=lambda: state["form"]))
    field.first = field
    c.page = SimpleNamespace(
        is_closed=lambda: False,
        locator=lambda _: field,
        wait_for_timeout=AsyncMock(),
    )
    c._is_logged_in = AsyncMock(return_value=False)

    async def reveal(**kwargs):
        state["form"] = True

    entry = SimpleNamespace(click=AsyncMock(side_effect=reveal))
    c._login_entry_control = AsyncMock(return_value=entry)
    assert asyncio.run(c._ensure_login_form()) is True
    assert entry.click.await_count == 1


def test_already_logged_in_does_not_click_login():
    c = client()
    c.page = SimpleNamespace(is_closed=lambda: False)
    c._is_logged_in = AsyncMock(return_value=True)
    c._login_entry_control = AsyncMock()
    assert asyncio.run(c._ensure_login_form()) is False
    c._login_entry_control.assert_not_awaited()


def test_navigation_retries_an_ignored_click_but_stops_at_destination():
    c = client()
    target = SimpleNamespace(is_visible=AsyncMock(return_value=False))
    target.first = target
    source = SimpleNamespace(
        is_visible=AsyncMock(return_value=True),
        is_enabled=AsyncMock(return_value=True),
        click=AsyncMock(),
    )
    source.first = source
    c.page = SimpleNamespace(locator=lambda sel: target if sel == "next" else source)
    c._require_auto_session = AsyncMock()
    c._wait_for_authenticated_transition = AsyncMock(
        side_effect=[PlaywrightTimeoutError("ignored click"), None],
    )
    asyncio.run(c._advance_auto_navigation("previous", "next", "test navigation"))
    assert source.click.await_count == 2
    target.is_visible.return_value = True
    asyncio.run(c._advance_auto_navigation("previous", "next", "test navigation"))
    assert source.click.await_count == 2


def test_missing_destination_is_not_reported_as_success():
    c = client()
    target = SimpleNamespace(is_visible=AsyncMock(return_value=False))
    target.first = target
    c.page = SimpleNamespace(locator=lambda _: target)
    c._require_auto_session = AsyncMock()
    with pytest.raises(PlaywrightTimeoutError, match="Expected page"):
        asyncio.run(c._wait_for_authenticated_transition("missing", "test", timeout_ms=0))


@pytest.mark.parametrize("critical_window", [False, True])
def test_login_monitor_recovers_missing_clock_without_inspecting_critical_window(
    monkeypatch, critical_window
):
    from app.services.ttd import client as module

    monkeypatch.setattr(module, "LOGIN_STABILITY_SECONDS", 0)
    c = client()
    c._last_release_snapshot = ("09:00:00", "", 2 if critical_window else None)
    c._is_login_page_visible = AsyncMock(return_value=True)
    cancelled = []

    async def release():
        try:
            await asyncio.sleep(0.8)
            return "completed"
        finally:
            cancelled.append(True)

    if critical_window:
        assert asyncio.run(c._await_release_with_login_monitor(release())) == "completed"
        c._is_login_page_visible.assert_not_awaited()
    else:
        with pytest.raises(AutoSessionExpiredError):
            asyncio.run(c._await_release_with_login_monitor(release()))
    assert cancelled == [True]


@pytest.mark.parametrize("submission_started", [False, True])
def test_flow_recovery_is_bounded_and_never_restarts_a_possible_booking(submission_started):
    c = client()
    c.page = SimpleNamespace(is_closed=lambda: False)
    c.open_login = AsyncMock(return_value={})
    c.login_auto = AsyncMock()
    c._require_auto_session = AsyncMock()

    async def interrupted(*args, **kwargs):
        if submission_started:
            c._last_booking_request_at = 1
        raise AutoSessionExpiredError("returned login screen")

    c.donate_auto = AsyncMock(side_effect=interrupted)
    task = SimpleNamespace(
        payload={
            "username": "test@example.invalid",
            "password": "test-only",
            "donation": 10000,
            "pilgrim_details": [],
        }
    )
    with pytest.raises(AutoSessionExpiredError):
        asyncio.run(c.execute_auto(task))
    assert c.open_login.await_count == (1 if submission_started else AUTO_RECOVERY_LIMIT + 1)


@pytest.mark.skipif(os.environ.get("TTD_RECOVERY_BROWSER_TEST") != "1", reason="Opt-in browser")
def test_real_browser_recovers_returned_login_and_refills_credentials():
    from app.core.browser import BrowserContextFactory

    html = """<!doctype html><title>Local recovery test</title><div id="view"></div>
    <script>
    window.opens = 0;
    function landing() { view.innerHTML = '<button onclick="window.showLoginForm()">Login</button>'; }
    function showLoginForm() {
      window.opens++;
      view.innerHTML = '<input name="uName"><input name="pwd" type="password">' +
        '<input id="txtInput"><button id="login_sub" onclick="window.submitLogin()">Login</button>';
    }
    async function submitLogin() {
      const data = {username:document.querySelector('[name=uName]').value,
                    password:document.querySelector('[name=pwd]').value};
      landing();
      const response = await fetch('/v1/authenticate', {method:'POST',body:JSON.stringify(data)});
      if ((await response.json()).loginSuccess)
        view.innerHTML = '<nav ng-hide="updateProfileOtp"><a ng-click="logout()">Logout</a></nav>';
    }
    landing();
    </script>"""

    submissions = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = html.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            submissions.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            body = json.dumps({"loginSuccess": len(submissions) == 2}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()

    async def scenario():
        context, page, scratch = await BrowserContextFactory.launch(0, headless=True)
        try:
            await page.goto(
                f"http://127.0.0.1:{server.server_port}/",
                wait_until="domcontentloaded",
                timeout=10000,
            )
            c = client()
            c.page = page

            async def test_captcha():
                await page.fill(LOGIN_CAPTCHA_INPUT_SELECTOR, "TEST")

            c._solve_login_captcha = AsyncMock(side_effect=test_captcha)
            await c.login_auto("test@example.invalid", "test-only", max_attempts=3)
            await page.wait_for_selector("a[ng-click='logout()']")
            assert (
                submissions == [{"username": "test@example.invalid", "password": "test-only"}] * 2
            )
            assert await page.evaluate("window.opens") == 2
            assert await c._is_logged_in()
        finally:
            await BrowserContextFactory.cleanup(context, scratch)

    try:
        asyncio.run(scenario())
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
