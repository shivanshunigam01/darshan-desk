from __future__ import annotations

import asyncio
import runpy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import pytest

from app.services.ttd.booking_helper import TTDClient

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


@pytest.mark.parametrize("standalone", [False, True])
@pytest.mark.parametrize("http2", [False, True])
def test_custom_transport_receives_protocol_and_pool_settings(standalone, http2):
    client_type = (
        runpy.run_path(str(SCRIPTS / "ttd_booking_helper.py"))["TTDClient"]
        if standalone
        else TTDClient
    )

    async def scenario():
        client = client_type(http2=http2)
        try:
            # The real transport's pool is the regression boundary: client-level
            # options alone silently leave these at HTTPX transport defaults.
            pool = client._client._transport._pool
            assert pool._http2 is http2
            assert pool._max_connections == 8
            assert pool._max_keepalive_connections == 2
            assert pool._keepalive_expiry == 120.0
        finally:
            await client.aclose()

    asyncio.run(scenario())


@pytest.mark.parametrize("status, expected_count", [(200, 3), (429, 1)])
def test_diagnostic_reuses_connection_and_stops_on_rate_limit(status, expected_count):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_HEAD(self):
            requests.append((self.command, self.headers.get("Authorization")))
            self.send_response(status)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        measure = runpy.run_path(str(SCRIPTS / "network_check.py"))["measure"]
        rows = asyncio.run(measure(f"http://127.0.0.1:{server.server_port}/", 3, False))
        assert len(rows) == expected_count
        assert rows[0]["new_tcp_connection"] is True
        assert all(row["new_tcp_connection"] is False for row in rows[1:])
        assert all(row["protocol"] == "HTTP/1.1" for row in rows)
        assert requests == [("HEAD", None)] * expected_count
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
