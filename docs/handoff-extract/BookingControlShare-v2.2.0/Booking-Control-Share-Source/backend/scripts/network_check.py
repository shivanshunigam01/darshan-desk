"""Standalone, unauthenticated HEAD probes; never imported by the booking flow."""

from __future__ import annotations

import argparse
import asyncio
import json
import time

import httpx


async def measure(url: str, samples: int, http2: bool) -> list[dict]:
    results = []
    transport = httpx.AsyncHTTPTransport(
        http2=http2,
        retries=0,
        limits=httpx.Limits(max_connections=1, max_keepalive_connections=1, keepalive_expiry=120),
    )
    async with httpx.AsyncClient(
        transport=transport,
        timeout=10,
        follow_redirects=False,
    ) as client:
        for index in range(samples):
            phases: dict[str, float] = {}
            starts: dict[str, float] = {}

            async def trace(event: str, info: dict) -> None:
                # Do not record info: it can include headers and cookie values.
                phase, state = event.rsplit(".", 1)
                if state == "started":
                    starts[phase] = time.perf_counter()
                elif state == "complete" and phase in starts:
                    phases[phase] = round((time.perf_counter() - starts[phase]) * 1000, 2)

            started = time.perf_counter()
            row = {"sample": index + 1}
            try:
                response = await client.head(url, extensions={"trace": trace})
                row.update(status=response.status_code, protocol=response.http_version)
            except httpx.HTTPError as exc:
                # Exception text may contain a user-supplied URL; report only the type.
                row["error"] = type(exc).__name__
            row["total_ms"] = round((time.perf_counter() - started) * 1000, 2)
            row["phases_ms"] = phases
            # connect_tcp includes resolver time; it is not a pure TCP RTT.
            row["new_tcp_connection"] = "connection.connect_tcp" in starts
            results.append(row)
            if "error" in row or row.get("status") in (403, 429, 503):
                break
            if index + 1 < samples:
                await asyncio.sleep(1)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="https://tirupatibalaji.ap.gov.in/")
    parser.add_argument("--samples", type=int, choices=range(1, 6), default=3)
    parser.add_argument("--http1", action="store_true", help="Compare HTTP/1.1 separately")
    args = parser.parse_args()
    url = httpx.URL(args.url)
    if url.scheme not in ("http", "https") or not url.host or url.username or url.password:
        parser.error("Use an HTTP(S) URL without credentials")
    rows = asyncio.run(measure(str(url), args.samples, http2=not args.http1))
    print(json.dumps({"samples": rows}, indent=2))
    return int(any("error" in row or row.get("status", 0) >= 400 for row in rows))


if __name__ == "__main__":
    raise SystemExit(main())
