from datetime import date, datetime, timedelta

from pydantic import ValidationError
import pytest

from app.workers.models import CaptchaSubmitRequest, TTDRequest, TTD_TIMEZONE


def booking():
    return {
        "username": "account@example.com",
        "password": "secret",
        "donation": 10_000,
        "pilgrim_details": [
            {
                "name": "John Doe",
                "age": 45,
                "gender": "M",
                "id_type": "Aadhaar Card",
                "id_doc_number": "123412341234",
            }
        ],
    }


def future_booking(**overrides):
    payload = booking()
    payload.update(
        {
            "booking_type": "future",
            "future_booking_dates": [datetime.now(TTD_TIMEZONE).date() + timedelta(days=14)],
            "additional_laddus": 1,
        }
    )
    payload.update(overrides)
    return payload


def test_captcha_submit_request_normalizes_value():
    req = CaptchaSubmitRequest(value=" q8f2k1 ")
    assert req.value == "Q8F2K1"


def test_captcha_submit_request_rejects_invalid_value():
    with pytest.raises(ValidationError):
        CaptchaSubmitRequest(value="Q8F2!")


def test_manual_request_uses_count():
    req = TTDRequest(mode="manual", count=5, headless=False)
    assert req.count == 5
    assert req.bookings is None


def test_auto_request_uses_bookings():
    req = TTDRequest(mode="auto", bookings=[booking(), booking()])
    assert req.count is None
    assert req.bookings is not None
    assert len(req.bookings) == 2


def test_manual_request_cannot_have_bookings():
    with pytest.raises(ValidationError):
        TTDRequest(mode="manual", count=2, bookings=[booking()])


def test_auto_request_cannot_have_count():
    with pytest.raises(ValidationError):
        TTDRequest(mode="auto", count=2, bookings=[booking()])


def test_manual_requires_count():
    with pytest.raises(ValidationError):
        TTDRequest(mode="manual")


def test_auto_requires_bookings():
    with pytest.raises(ValidationError):
        TTDRequest(mode="auto")


def test_future_booking_accepts_multiple_dates():
    dates = [datetime.now(TTD_TIMEZONE).date() + timedelta(days=14), datetime.now(TTD_TIMEZONE).date() + timedelta(days=21)]
    req = TTDRequest(mode="auto", bookings=[future_booking(future_booking_dates=dates)])
    assert req.bookings is not None
    assert req.bookings[0].future_booking_dates == dates
    assert req.bookings[0].future_booking_forced is False


def test_future_booking_accepts_forced_mode():
    req = TTDRequest(
        mode="auto",
        bookings=[future_booking(future_booking_forced=True)],
    )
    assert req.bookings is not None
    assert req.bookings[0].future_booking_forced is True


def test_future_booking_requires_at_least_one_date():
    with pytest.raises(ValidationError):
        TTDRequest(
            mode="auto",
            bookings=[future_booking(future_booking_dates=[])],
        )


def test_future_booking_rejects_duplicate_dates():
    target = datetime.now(TTD_TIMEZONE).date() + timedelta(days=14)
    with pytest.raises(ValidationError):
        TTDRequest(
            mode="auto",
            bookings=[future_booking(future_booking_dates=[target, target])],
        )


def test_future_booking_rejects_non_future_date():
    with pytest.raises(ValidationError):
        TTDRequest(
            mode="auto",
            bookings=[future_booking(future_booking_dates=[datetime.now(TTD_TIMEZONE).date()])],
        )


def test_current_booking_rejects_future_options():
    with pytest.raises(ValidationError):
        TTDRequest(
            mode="auto",
            bookings=[
                booking() | {
                    "future_booking_dates": [datetime.now(TTD_TIMEZONE).date() + timedelta(days=14)],
                }
            ],
        )


def test_legacy_payload_is_rejected():
    with pytest.raises(ValidationError):
        TTDRequest(mode="manual", count=1, payload={})



def test_booking_strategy_defaults_to_fully_browser_based():
    req = TTDRequest(mode="auto", bookings=[booking()])
    assert req.bookings is not None
    assert req.bookings[0].booking_strategy == "browser"


def test_http_payload_strategy_rejects_future_booking():
    with pytest.raises(ValidationError, match="current-day bookings only"):
        TTDRequest(
            mode="auto",
            bookings=[future_booking(booking_strategy="http_payload")],
        )


def test_http_payload_strategy_exposes_v4_defaults():
    req = TTDRequest(mode="auto", bookings=[booking() | {"booking_strategy": "http_payload"}])
    assert req.bookings is not None
    configured = req.bookings[0]
    assert configured.clock_source == "ttd"
    assert configured.continue_attempts == 3
    assert configured.booking_attempts == 2
    assert configured.attempt_stagger_seconds == 0.0


def test_http_payload_strategy_accepts_ntp_and_concurrency_options():
    req = TTDRequest(
        mode="auto",
        bookings=[
            booking()
            | {
                "booking_strategy": "http_payload",
                "clock_source": "both",
                "continue_attempts": 5,
                "booking_attempts": 3,
                "attempt_stagger_seconds": 0.25,
                "ntp_servers": [" time.cloudflare.com ", "time.google.com"],
                "ntp_timeout_seconds": 3.5,
            }
        ],
    )
    assert req.bookings is not None
    configured = req.bookings[0]
    assert configured.clock_source == "both"
    assert configured.continue_attempts == 5
    assert configured.booking_attempts == 3
    assert configured.attempt_stagger_seconds == 0.25
    assert configured.ntp_servers == ["time.cloudflare.com", "time.google.com"]
    assert configured.ntp_timeout_seconds == 3.5


@pytest.mark.parametrize(
    "options",
    [
        {"clock_source": "local"},
        {"continue_attempts": 0},
        {"continue_attempts": 6},
        {"booking_attempts": 0},
        {"booking_attempts": 4},
        {"attempt_stagger_seconds": -0.1},
        {"attempt_stagger_seconds": 2.1},
        {"ntp_timeout_seconds": 0},
        {"ntp_timeout_seconds": 10.1},
        {"ntp_servers": ["a", "b", "c", "d", "e", "f"]},
    ],
)
def test_http_payload_strategy_rejects_invalid_timing_options(options):
    with pytest.raises(ValidationError):
        TTDRequest(
            mode="auto",
            bookings=[booking() | {"booking_strategy": "http_payload", **options}],
        )
