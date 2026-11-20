from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone

from app.services.ttd import booking_helper as helper

UTC = timezone.utc


def test_race_success_returns_first_result_and_cancels_losers():
    async def scenario() -> None:
        cancelled = asyncio.Event()

        async def fast() -> str:
            return "winner"

        async def slow() -> str:
            try:
                await asyncio.sleep(10)
                return "late"
            finally:
                cancelled.set()

        result = await helper._race_success(
            [asyncio.create_task(fast()), asyncio.create_task(slow())],
            name="unit-test",
        )
        assert result == "winner"
        assert cancelled.is_set()

    asyncio.run(scenario())


def test_race_success_prefers_actionable_error_when_all_attempts_fail():
    async def scenario() -> None:
        async def rejected(exc: Exception) -> None:
            raise exc

        try:
            await helper._race_success(
                [
                    asyncio.create_task(rejected(helper.TTDError("generic"))),
                    asyncio.create_task(rejected(helper.QuotaExceededError("quota"))),
                ],
                name="unit-test",
            )
        except helper.QuotaExceededError as exc:
            assert str(exc) == "quota"
        else:
            raise AssertionError("Expected the most actionable failure")

    asyncio.run(scenario())


def test_continue_race_restores_the_winning_nonce_after_loser_cleanup():
    async def scenario() -> None:
        client = helper.TTDClient()

        async def fake_attempt(idx: int, stagger_seconds: float):
            if idx == 0:
                client.payment_nonce = "winner-nonce"
                return helper.ContinueResponse(message="ok", paymentNonce="winner-nonce")
            try:
                await asyncio.sleep(10)
                return helper.ContinueResponse(message="late", paymentNonce="late-nonce")
            finally:
                # Simulates a late shared-state mutation from a cancelled request.
                client.payment_nonce = "late-nonce"

        client._continue_attempt = fake_attempt  # type: ignore[method-assign]
        try:
            result = await client.continue_booking_race(attempts=2)
            assert result.paymentNonce == "winner-nonce"
            assert client.payment_nonce == "winner-nonce"
        finally:
            await client.aclose()

    asyncio.run(scenario())


def test_ntp_sync_filters_offset_outliers_and_anchors_monotonic_clock(monkeypatch):
    samples = {
        "ntp-a": helper.NTPResult(
            server="ntp-a", offset_seconds=0.010, delay_seconds=0.030,
            midpoint_mono=time.monotonic(), midpoint_server_utc=datetime.now(UTC),
        ),
        "ntp-b": helper.NTPResult(
            server="ntp-b", offset_seconds=0.012, delay_seconds=0.010,
            midpoint_mono=time.monotonic(), midpoint_server_utc=datetime.now(UTC),
        ),
        "ntp-outlier": helper.NTPResult(
            server="ntp-outlier", offset_seconds=1.000, delay_seconds=0.001,
            midpoint_mono=time.monotonic(), midpoint_server_utc=datetime.now(UTC),
        ),
    }
    monkeypatch.setattr(helper, "_ntp_query_blocking", lambda server, timeout: samples[server])

    async def scenario() -> None:
        client = helper.TTDClient(
            clock_source=helper.ClockSource.NTP,
            ntp_servers=["ntp-a", "ntp-b", "ntp-outlier"],
        )
        try:
            chosen = await client.sync_ntp()
            assert chosen.server == "ntp-b"
            assert client._ntp_anchor_utc is not None
            before = client.server_now()
            client._ntp_anchor_utc = before - timedelta(seconds=2)
            client._ntp_anchor_monotonic = time.monotonic() - 2
            now = client.server_now()
            assert abs((now - before).total_seconds()) < 0.2
            assert client.clock_status()["source"] == "ntp"
        finally:
            await client.aclose()

    asyncio.run(scenario())
