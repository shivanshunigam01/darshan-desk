"""Opt-in local browser check: RUN_BROWSER_TESTS=1 uv run pytest -s -q <this file>."""

from __future__ import annotations

import asyncio
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import pytest

from app.core.browser import BrowserContextFactory


@pytest.mark.skipif(os.environ.get("RUN_BROWSER_TESTS") != "1", reason="Opt-in browser launch")
@pytest.mark.parametrize("headless", [True, False])
def test_real_browser_applies_zoom_on_local_page(headless):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"<!doctype html><title>Local zoom check</title><p>Browser startup check</p>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()

    async def scenario():
        context, page, scratch = await BrowserContextFactory.launch(0, headless=headless)
        try:
            await page.goto(
                f"http://127.0.0.1:{server.server_port}/", wait_until="domcontentloaded"
            )
            pages_before = len(context.pages)
            await BrowserContextFactory.set_browser_zoom(page, 75)
            assert len(context.pages) == pages_before  # No orphaned controller tab.
            worker = next(
                worker
                for worker in context.service_workers
                if worker.url.endswith("/service_worker.js")
            )
            controller = await context.new_page()
            await controller.goto(worker.url.rsplit("/", 1)[0] + "/main.html")
            actual_zoom = await asyncio.wait_for(
                controller.evaluate(
                    """async (url) => {
                    const tabs = await chrome.tabs.query({});
                    const tab = tabs.find(tab => tab.url === url);
                    if (!tab) throw new Error("Test tab not found");
                    return await chrome.tabs.getZoom(tab.id);
                }""",
                    page.url,
                ),
                timeout=10,
            )
            await controller.close()
            assert actual_zoom == pytest.approx(0.75)
            assert not page.is_closed()
            assert await page.title() == "Local zoom check"
        finally:
            await asyncio.wait_for(BrowserContextFactory.cleanup(context, scratch), 60)

    try:
        asyncio.run(scenario())
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
