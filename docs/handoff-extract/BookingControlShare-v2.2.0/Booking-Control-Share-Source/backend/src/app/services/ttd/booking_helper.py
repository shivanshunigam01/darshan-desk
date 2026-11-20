from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
import statistics
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from enum import Enum
from pathlib import Path
from typing import Any

import httpx
from loguru import logger
from pydantic import BaseModel, Field, field_validator, model_validator

BASE_URL = "https://tirupatibalaji.ap.gov.in"
IST = timezone(timedelta(hours=5, minutes=30))
UTC = timezone.utc

DEFAULT_HEADERS = {
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9",
    "Content-Type": "application/json",
    "Origin": BASE_URL,
    "Referer": f"{BASE_URL}/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:155.0) Gecko/20100101 Firefox/155.0",
}

# Business rules observed from the TTD frontend.
DONATION_PER_PILGRIM = 10_000
MAX_PILGRIMS_PER_BOOKING = 4

# Timing.
SESSION_SAFETY_SECONDS = 360.0
RENEW_LEAD_SECONDS = 30.0
SLEEP_CHUNK_SECONDS = 1.0
CLOCK_PROBE_LEAD_SECONDS = 30.0
SUMMARY_REFRESH_LEAD_SECONDS = 120.0
SUMMARY_REFRESH_RETRY_DELAY_SECONDS = 3.0
SUMMARY_REFRESH_MAX_ATTEMPTS = 4
DEFAULT_RAZORPAY_PG_ID = 15  # Captured HAR: pgId 15 = HDFC/Razorpay for this flow.
SRIVANI_TRUST_ID = "23"
SRIVANI_TRUST_NAME = "Sri Venkateswara Aalayala Nirmanam Trust (SRIVANI TRUST)"

# Default API timeout; Continue has a longer read timeout because the observed response took ~34s.
DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
CONTINUE_TIMEOUT = httpx.Timeout(connect=5.0, read=60.0, write=10.0, pool=5.0)

DEFAULT_NTP_SERVERS: tuple[str, ...] = (
    "time.google.com",
    "in.pool.ntp.org",
)
NTP_TIMEOUT_SECONDS = 2.0
NTP_EPOCH_DELTA = 2_208_988_800  # seconds between 1900-01-01 and 1970-01-01


class ClockSource(str, Enum):
    TTD = "ttd"
    NTP = "ntp"
    BOTH = "both"


class DarshanType(Enum):
    CURRENT = 100077
    FUTURE = 100078


class ChannelType(Enum):
    ONLINE = 100002


class IDTypes(Enum):
    AADHAR = 1015
    PASSPORT = 1013
    PAN = 1011
    RATION = 1012
    DL = 1014
    VOTER = 1016


class Gender(str, Enum):
    MALE = "M"
    FEMALE = "F"
    OTHER = "O"


class TTDError(Exception):
    """Base class for TTD API errors."""


class UnauthorizedError(TTDError):
    pass


class BookingNotOpenError(TTDError):
    pass


class ForbiddenError(TTDError):
    pass


class NetworkAnomalyError(TTDError):
    pass


class TooManyHitsError(TTDError):
    pass


class QuotaExceededError(TTDError):
    pass


class InvalidBookingDateError(TTDError):
    pass


class SessionExpiredError(TTDError):
    pass


class DonationRuleError(TTDError, ValueError):
    pass


_ERROR_MAP: dict[str, type[TTDError]] = {
    "Network Anamoly Detected.Please Try Again": NetworkAnomalyError,
    "Too many hits.Please try after some time.": TooManyHitsError,
    "Cannot book as quota exceeded": QuotaExceededError,
    "Invalid Booking Date. You can only book for the current day.": InvalidBookingDateError,
}

_ID_TYPE_BY_NAME = {
    "aadhar": IDTypes.AADHAR,
    "passport": IDTypes.PASSPORT,
    "pan": IDTypes.PAN,
    "ration": IDTypes.RATION,
    "dl": IDTypes.DL,
    "voter": IDTypes.VOTER,
}

_GENDER_BY_NAME = {
    "m": Gender.MALE,
    "male": Gender.MALE,
    "f": Gender.FEMALE,
    "female": Gender.FEMALE,
    "o": Gender.OTHER,
    "other": Gender.OTHER,
}

# Priority used when every attempt fails, so we re-raise the most
# actionable error rather than whichever one happened to finish first.
_FAILURE_PRIORITY: dict[type[TTDError], int] = {
    BookingNotOpenError: 100,
    QuotaExceededError: 95,
    InvalidBookingDateError: 90,
    TooManyHitsError: 85,
    NetworkAnomalyError: 80,
    SessionExpiredError: 75,
    UnauthorizedError: 70,
    ForbiddenError: 65,
    TTDError: 10,
}


def _pick_best_failure(failures: list[Exception]) -> Exception:
    return max(failures, key=lambda e: _FAILURE_PRIORITY.get(type(e), 0))


async def _race_success(
    tasks: list[asyncio.Task],
    *,
    name: str,
    warn_on_duplicate_success: bool = True,
) -> Any:
    """Await a batch of identical in-flight requests; return the first success.

    * First non-exception result wins.
    * All still-pending tasks are cancelled (their results are discarded).
    * If more than one task succeeds before cancellation propagates, a warning
      is logged — non-idempotent endpoints (booking!) must be reconciled
      manually when this fires.
    * If every task fails, the most specific failure is re-raised.
    """
    task_to_idx = {t: i for i, t in enumerate(tasks)}
    pending: set[asyncio.Task] = set(tasks)
    failures: list[Exception] = []
    success: Any = None
    winner_idx: int | None = None

    try:
        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)

            for task in done:
                idx = task_to_idx[task]
                if task.cancelled():
                    continue

                exc = task.exception()
                if exc is not None:
                    failures.append(exc)
                    logger.debug("{} attempt #{} failed: {}", name, idx + 1, exc)
                    continue

                if success is None:
                    success = task.result()
                    winner_idx = idx
                    logger.info("{} attempt #{} succeeded first", name, idx + 1)
                else:
                    msg = (
                        "{} attempt #{} ALSO succeeded after winner #{}; "
                        "discarding extra result — verify server-side state for duplicates."
                    )
                    args = (name, idx + 1, (winner_idx or 0) + 1)
                    (logger.warning if warn_on_duplicate_success else logger.debug)(msg, *args)

            if success is not None:
                for p in pending:
                    p.cancel()
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)
                pending = set()
                break
    finally:
        for p in list(pending):
            if not p.done():
                p.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

    if success is None:
        if failures:
            raise _pick_best_failure(failures)
        raise TTDError(f"All {name} attempts failed without any recorded exception.")
    return success


def pilgrims_from_donation(amount: int) -> int:
    if amount < DONATION_PER_PILGRIM:
        return 0
    return min(amount // DONATION_PER_PILGRIM, MAX_PILGRIMS_PER_BOOKING)


class LoginCredentials(BaseModel):
    username: str
    password: str


class Pilgrim(BaseModel):
    piligrimName: str
    piligrimAge: int
    piligrimGender: Gender | str
    piligrimIdProofType: IDTypes | int
    idProofNumber: str

    model_config = {"use_enum_values": True}

    @field_validator("piligrimIdProofType", mode="before")
    @classmethod
    def _coerce_id_type(cls, value: Any) -> Any:
        if isinstance(value, str):
            key = value.strip().lower()
            if key in _ID_TYPE_BY_NAME:
                return _ID_TYPE_BY_NAME[key].value
            if key.isdigit():
                return int(key)
        return value

    @field_validator("piligrimGender", mode="before")
    @classmethod
    def _coerce_gender(cls, value: Any) -> Any:
        if isinstance(value, str):
            key = value.strip().lower()
            if key in _GENDER_BY_NAME:
                return _GENDER_BY_NAME[key].value
        return value


class _DonationPilgrimRule(BaseModel):
    donationAmount: int
    darshanBookingPilgrimList: list[Pilgrim]

    @model_validator(mode="after")
    def _check(self) -> "_DonationPilgrimRule":
        n = len(self.darshanBookingPilgrimList)
        if n < 1:
            raise DonationRuleError("At least one pilgrim is required.")
        if n > MAX_PILGRIMS_PER_BOOKING:
            raise DonationRuleError(
                f"Max {MAX_PILGRIMS_PER_BOOKING} pilgrims per booking, got {n}."
            )
        if self.donationAmount < DONATION_PER_PILGRIM:
            raise DonationRuleError(
                f"Minimum donation is ₹{DONATION_PER_PILGRIM:,}; got ₹{self.donationAmount:,}."
            )
        unlocked = pilgrims_from_donation(self.donationAmount)
        if unlocked < n:
            raise DonationRuleError(
                f"Donation ₹{self.donationAmount:,} unlocks {unlocked} pilgrim(s), "
                f"but {n} supplied. Need at least ₹{n * DONATION_PER_PILGRIM:,}."
            )
        return self


class CurrentDayBookingRequest(_DonationPilgrimRule):
    darshanDate: str
    userId: str
    darshanAmount: int
    totalAmount: int
    noOfPersons: str = "1"
    slotId: int
    slotName: str
    channelTypeId: int = ChannelType.ONLINE.value
    darshanTypeId: int = DarshanType.CURRENT.value

    @model_validator(mode="after")
    def _check_no_of_persons(self) -> "CurrentDayBookingRequest":
        n = len(self.darshanBookingPilgrimList)
        try:
            declared = int(self.noOfPersons)
        except (TypeError, ValueError) as exc:
            raise DonationRuleError(
                f"noOfPersons must be integer-like, got {self.noOfPersons!r}."
            ) from exc
        if declared != n:
            raise DonationRuleError(f"noOfPersons={self.noOfPersons!r} != len(pilgrims)={n}.")
        return self


class AdvanceBookingRequest(_DonationPilgrimRule):
    darshanDate: str
    userId: str
    darshanAmount: int
    totalAmount: int
    noOfPersons: int = 1
    slotId: int
    slotName: str = ""
    channelTypeId: int = ChannelType.ONLINE.value
    darshanTypeId: int = DarshanType.FUTURE.value
    accomTypeId: int | None = None
    accomFlag: str = "false"
    additionalLaddus: int = 1

    @model_validator(mode="after")
    def _check_no_of_persons(self) -> "AdvanceBookingRequest":
        n = len(self.darshanBookingPilgrimList)
        if self.noOfPersons != n:
            raise DonationRuleError(f"noOfPersons={self.noOfPersons} != len(pilgrims)={n}.")
        return self


class LoginResponse(BaseModel):
    emailVerfyFailed: bool
    smsVerfyFailed: bool
    mobileNumber: str | None = None
    userId: str
    userRole: str
    watchListFlag: str
    accountStatus: str | None = None
    dipStatus: str
    darshanDipStatus: str
    lastLogin: str
    mobilCheck: str | None = None
    isUserLoggedIn: bool | None = None
    globalPropertyValue: str
    loginSuccess: bool


class UserContext(BaseModel):
    userName: str
    userId: int
    isSmsVerified: bool
    isEmailVerified: bool
    watchListFlag: str
    sessionStartTime: str
    timeOutPeriod: str
    isDonor: str
    roleId: int
    enabled: bool

    model_config = {"extra": "allow"}


class UserDetail(BaseModel):
    userId: int
    userFirstName: str | None = None
    userLastName: str | None = None
    userEmail: str | None = None
    userPhoneMobile: str | None = None
    userAddressLine1: str | None = None
    userAddressLine2: str | None = None
    userCity: str | None = None
    userState: str | None = None
    userZipCode: str | None = None
    userCountry: str | None = None
    userDob: str | None = None
    gender: str | None = None
    age: int | None = None
    isDonor: str | None = None

    model_config = {"extra": "allow"}


class NoOfPersonsResponse(BaseModel):
    NoOfPersons: str


class CurrentDaySummary(BaseModel):
    # TTD intentionally returns a partial summary well before release. These five
    # fields may be null until approximately T-2 minutes and are refreshed then.
    quotaCount: int
    slottime: str | None = None
    minpersons: str | None = None
    maxpersons: str | None = None
    advanceminpersons: str | None = None
    advancemaxpersons: str | None = None
    noOfladdus: int
    minAmount: int
    advanceminAmount: int
    darshanAmount: int
    maxAmount: int
    advancemaxAmount: int
    success: int
    pending: int
    failed: int
    released: int
    quotaReleaseTime: str

    model_config = {"extra": "allow"}


class ContinueResponse(BaseModel):
    message: str
    paymentNonce: str


class DarshanSummaryResponse(BaseModel):
    availableDatesList: list[Any] = Field(default_factory=list)
    startAndEndDates: list[str]
    blockedDates: list[Any] = Field(default_factory=list)
    bookedDates: list[str] = Field(default_factory=list)
    frequency: Any = None
    darshanAmount: int
    frequencyList: Any = None
    availableDatesListSrivani: dict[str, Any] = Field(default_factory=dict)
    availableDatesLisTnew: dict[str, Any] = Field(default_factory=dict)
    srivaniAccomFlag: Any = None
    accomAmount: Any = None
    cautionDeposit: Any = None
    darshanTypeId: Any = None
    errorMsg: Any = None

    @field_validator("darshanAmount", mode="before")
    @classmethod
    def _coerce_darshan_amount(cls, value: Any) -> Any:
        return None if value is None else int(value)


class BookingResponse(BaseModel):
    orderId: str

    model_config = {"extra": "allow"}


@dataclass(frozen=True)
class SessionInfo:
    started_at_ist: datetime
    timeout_seconds: int

    @property
    def expires_at_ist(self) -> datetime:
        return self.started_at_ist + timedelta(seconds=self.timeout_seconds)


@dataclass(frozen=True)
class ClockSample:
    server_utc: datetime
    offset_seconds: float
    rtt_seconds: float


@dataclass(frozen=True)
class NTPResult:
    server: str
    offset_seconds: float  # server_clock − local_clock
    delay_seconds: float  # round-trip delay (server-clock corrected)
    midpoint_mono: float  # local monotonic at exchange midpoint
    midpoint_server_utc: datetime  # best estimate of server time at that instant


def _ntp_timestamp_to_datetime(ts: int) -> datetime:
    seconds = (ts >> 32) - NTP_EPOCH_DELTA
    fraction = (ts & 0xFFFFFFFF) / 2**32
    return datetime.fromtimestamp(seconds + fraction, tz=UTC)


def _datetime_to_ntp_bytes(dt: datetime) -> bytes:
    total = dt.timestamp()
    seconds = int(total) + NTP_EPOCH_DELTA
    fraction = int((total - int(total)) * 2**32) & 0xFFFFFFFF
    return seconds.to_bytes(4, "big") + fraction.to_bytes(4, "big")


def _ntp_query_blocking(server: str, timeout: float) -> NTPResult:
    """One SNTP exchange against `server` over UDP. Runs in a worker thread.

    Uses the standard four-timestamp algorithm:
        offset = ((t2 - t1) + (t3 - t4)) / 2
        delay  = (t4 - t1) - (t3 - t2)
    """
    packet = bytearray(48)
    packet[0] = 0b00100011  # LI=0, VN=4, Mode=3 (client)

    t1_wall = datetime.now(UTC)
    t1_mono = time.monotonic()
    packet[40:48] = _datetime_to_ntp_bytes(t1_wall)  # hint; servers typically ignore

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        infos = socket.getaddrinfo(server, 123, socket.AF_INET, socket.SOCK_DGRAM)
        if not infos:
            raise TTDError(f"Could not resolve NTP server {server!r}")
        sockaddr = infos[0][4]
        sock.sendto(bytes(packet), sockaddr)
        data, _ = sock.recvfrom(48)
        t4_mono = time.monotonic()
        t4_wall = datetime.now(UTC)
    finally:
        sock.close()

    if len(data) < 48:
        raise TTDError(f"NTP response from {server} truncated: {len(data)} bytes")

    stratum = data[1]
    if stratum == 0:
        kod = data[12:16].decode("ascii", errors="replace")
        raise TTDError(f"NTP server {server} sent Kiss-o'-Death: {kod!r}")
    if stratum >= 16:
        raise TTDError(f"NTP server {server} not synchronized (stratum={stratum})")

    t2 = _ntp_timestamp_to_datetime(int.from_bytes(data[32:40], "big"))  # server receive
    t3 = _ntp_timestamp_to_datetime(int.from_bytes(data[40:48], "big"))  # server transmit

    offset = ((t2 - t1_wall).total_seconds() + (t3 - t4_wall).total_seconds()) / 2.0
    delay = (t4_wall - t1_wall).total_seconds() - (t3 - t2).total_seconds()

    mid_mono = (t1_mono + t4_mono) / 2.0
    # Server clock at t1 = t1 + offset. Advance by monotonic delta to midpoint.
    mid_server = t1_wall + timedelta(seconds=offset + (mid_mono - t1_mono))

    return NTPResult(
        server=server,
        offset_seconds=offset,
        delay_seconds=max(0.0, delay),
        midpoint_mono=mid_mono,
        midpoint_server_utc=mid_server,
    )


class TTDClient:
    """Async HTTP-only TTD client with server-clock synchronization.

    Timing design:
      * Every response with a Date header can refresh the TTD clock estimate.
      * Optional SNTP samples provide an independent clock anchored to monotonic time.
      * A low-cost /common/activeEnv probe warms the HTTP/2 connection near release.
      * Configured Continue/booking request fan-out is only started at/after release;
        each individual HTTP request is never silently retried by the transport.
    """

    def __init__(
        self,
        *,
        timeout: httpx.Timeout | float = DEFAULT_TIMEOUT,
        http2: bool = True,
        verify: bool = True,
        clock_probe_path: str = "/common/activeEnv",
        clock_source: ClockSource = ClockSource.TTD,
        ntp_servers: list[str] | tuple[str, ...] | None = None,
        ntp_timeout: float = NTP_TIMEOUT_SECONDS,
    ) -> None:
        limits = httpx.Limits(
            max_connections=8,
            max_keepalive_connections=2,
            keepalive_expiry=120.0,
        )
        transport = httpx.AsyncHTTPTransport(
            http2=http2,
            verify=verify,
            limits=limits,
            retries=0,  # Never silently retry booking/Continue calls.
        )
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=timeout,
            http2=http2,
            verify=verify,
            headers=DEFAULT_HEADERS,
            follow_redirects=False,
            limits=limits,
            transport=transport,
            event_hooks={"request": [self._log_request]},
        )

        self.auth_token: str | None = None
        self.payment_nonce: str | None = None
        self.user_id: str | None = None
        self.user_context: UserContext | None = None
        self.session: SessionInfo | None = None
        self._credentials: LoginCredentials | None = None
        self._clock_probe_path = clock_probe_path

        # TTD-side clock state (unchanged).
        self._clock_samples: deque[ClockSample] = deque(maxlen=5)
        self._server_offset = timedelta(0)
        self._clock_anchor_utc: datetime | None = None
        self._clock_anchor_monotonic: float | None = None

        # NTP-side clock state.
        self.clock_source = ClockSource(clock_source)
        self._ntp_servers = tuple(ntp_servers) if ntp_servers else DEFAULT_NTP_SERVERS
        if ntp_timeout <= 0:
            raise ValueError("ntp_timeout must be greater than zero")
        self._ntp_timeout = ntp_timeout
        self._ntp_samples: deque[NTPResult] = deque(maxlen=8)
        self._ntp_anchor_utc: datetime | None = None
        self._ntp_anchor_monotonic: float | None = None
        self._ntp_offset = timedelta(0)

    async def __aenter__(self) -> "TTDClient":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------------
    # Clock synchronization
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_http_date(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            parsed = parsedate_to_datetime(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed.astimezone(UTC)
        except (TypeError, ValueError, OverflowError):
            return None

    def _observe_response_clock(
        self,
        response: httpx.Response,
        *,
        started_wall: datetime,
        finished_wall: datetime,
        started_monotonic: float,
        finished_monotonic: float,
    ) -> ClockSample | None:
        server_utc = self._parse_http_date(response.headers.get("date"))
        if server_utc is None:
            return None

        rtt = max(0.0, finished_monotonic - started_monotonic)

        # HTTP Date has only one-second resolution. For a normal lightweight probe,
        # midpoint timing gives a much better estimate than sampling after receipt.
        midpoint = started_wall + (finished_wall - started_wall) / 2
        offset_seconds = (server_utc - midpoint).total_seconds()
        sample = ClockSample(
            server_utc=server_utc,
            offset_seconds=offset_seconds,
            rtt_seconds=rtt,
        )
        self._clock_samples.append(sample)

        # Prefer the median of recent offsets to suppress one bad/cached sample.
        offsets = [s.offset_seconds for s in self._clock_samples]
        smoothed_offset = statistics.median(offsets)
        self._server_offset = timedelta(seconds=smoothed_offset)

        # Anchor server time to monotonic time. This avoids local wall-clock jumps
        # while waiting for the release boundary.
        self._clock_anchor_utc = server_utc
        self._clock_anchor_monotonic = (
            started_monotonic + (finished_monotonic - started_monotonic) / 2
        )

        return sample

    def _sync_server_time(self, response: httpx.Response) -> None:
        now_wall = datetime.now(UTC)
        now_mono = time.monotonic()
        self._observe_response_clock(
            response,
            started_wall=now_wall,
            finished_wall=now_wall,
            started_monotonic=now_mono,
            finished_monotonic=now_mono,
        )

    def server_now(self) -> datetime:
        if (
            self.clock_source in (ClockSource.NTP, ClockSource.BOTH)
            and self._ntp_anchor_utc is not None
            and self._ntp_anchor_monotonic is not None
        ):
            elapsed = time.monotonic() - self._ntp_anchor_monotonic
            return self._ntp_anchor_utc + timedelta(seconds=elapsed)
        if self._clock_anchor_utc is not None and self._clock_anchor_monotonic is not None:
            elapsed = time.monotonic() - self._clock_anchor_monotonic
            return self._clock_anchor_utc + timedelta(seconds=elapsed)
        return datetime.now(UTC) + self._server_offset

    def server_now_ist(self) -> datetime:
        return self.server_now().astimezone(IST)

    def seconds_until(self, hhmmss: str) -> float:
        try:
            hh, mm, ss = (int(part) for part in hhmmss.split(":"))
        except (ValueError, TypeError) as exc:
            raise TTDError(f"Bad HH:MM:SS value: {hhmmss!r}") from exc

        now = self.server_now_ist()
        target = now.replace(hour=hh, minute=mm, second=ss, microsecond=0)
        return max(0.0, (target - now).total_seconds())

    def release_datetime(self, hhmmss: str) -> datetime:
        try:
            hh, mm, ss = (int(part) for part in hhmmss.split(":"))
        except (ValueError, TypeError) as exc:
            raise TTDError(f"Bad HH:MM:SS value: {hhmmss!r}") from exc
        now = self.server_now_ist()
        return now.replace(hour=hh, minute=mm, second=ss, microsecond=0)

    def clock_status(self) -> dict[str, Any]:
        status: dict[str, Any] = {
            "source": self.clock_source.value,
            "server_now_ist": self.server_now_ist().isoformat(),
            "ttd_offset_seconds": round(self._server_offset.total_seconds(), 3),
            "ttd_samples": [
                {
                    "offset_seconds": round(s.offset_seconds, 3),
                    "rtt_seconds": round(s.rtt_seconds, 3),
                    "server_utc": s.server_utc.isoformat(),
                }
                for s in self._clock_samples
            ],
        }
        if self._ntp_anchor_utc is not None:
            age = (
                time.monotonic() - self._ntp_anchor_monotonic
                if self._ntp_anchor_monotonic is not None
                else None
            )
            status["ntp"] = {
                "offset_seconds": round(self._ntp_offset.total_seconds(), 3),
                "anchor_utc": self._ntp_anchor_utc.isoformat(),
                "anchor_age_seconds": round(age, 3) if age is not None else None,
                "samples": [
                    {
                        "server": s.server,
                        "offset_seconds": round(s.offset_seconds, 3),
                        "delay_seconds": round(s.delay_seconds, 3),
                    }
                    for s in self._ntp_samples
                ],
            }
        return status

    async def probe_server_clock(self) -> ClockSample:
        """Hit a read-only common endpoint to refresh Date + warm the connection."""
        started_wall = datetime.now(UTC)
        started_mono = time.monotonic()

        resp = await self._client.post(
            self._clock_probe_path,
            content=b"",
            headers={
                "Content-Type": "application/json",
                "Cache-Control": "no-cache",
            },
        )

        finished_mono = time.monotonic()
        finished_wall = datetime.now(UTC)

        sample = self._observe_response_clock(
            resp,
            started_wall=started_wall,
            finished_wall=finished_wall,
            started_monotonic=started_mono,
            finished_monotonic=finished_mono,
        )
        if sample is None:
            raise TTDError("Clock probe returned no usable Date header.")
        if resp.status_code >= 400:
            raise TTDError(f"Clock probe failed: HTTP {resp.status_code}")

        logger.debug(
            "Clock probe: RTT={:.3f}s offset={:+.3f}s server={} IST".format(
                sample.rtt_seconds,
                sample.offset_seconds,
                self.server_now_ist().strftime("%H:%M:%S.%f")[:-3],
            )
        )
        return sample

    async def sync_ntp(self, servers: list[str] | tuple[str, ...] | None = None) -> NTPResult:
        """Query NTP servers, filter outliers, set the monotonic anchor.

        Selection: median-offset filter (±50ms) to reject outliers, then the
        remaining sample with the lowest delay wins. The chosen sample's
        server-time-at-midpoint becomes the anchor, tracked forward on
        time.monotonic() so local clock jumps cannot corrupt release waits.
        """
        targets = tuple(servers) if servers else self._ntp_servers
        coros = [asyncio.to_thread(_ntp_query_blocking, s, self._ntp_timeout) for s in targets]
        raw = await asyncio.gather(*coros, return_exceptions=True)

        results: list[NTPResult] = []
        for server, item in zip(targets, raw):
            if isinstance(item, NTPResult):
                results.append(item)
                logger.debug(
                    "NTP {}: offset={:+.3f}s delay={:.3f}s",
                    server,
                    item.offset_seconds,
                    item.delay_seconds,
                )
            elif isinstance(item, Exception):
                logger.debug("NTP {} failed: {}", server, item)

        if not results:
            raise TTDError("All NTP servers failed.")

        median = statistics.median(r.offset_seconds for r in results)
        filtered = [r for r in results if abs(r.offset_seconds - median) <= 0.05]
        if not filtered:
            filtered = results
        best = min(filtered, key=lambda r: r.delay_seconds)

        self._ntp_samples.append(best)
        self._ntp_offset = timedelta(seconds=best.offset_seconds)
        self._ntp_anchor_utc = best.midpoint_server_utc
        self._ntp_anchor_monotonic = best.midpoint_mono

        logger.info(
            "NTP sync: {} servers answered; best={} offset={:+.3f}s delay={:.3f}s",
            len(results),
            best.server,
            best.offset_seconds,
            best.delay_seconds,
        )
        return best

    # ------------------------------------------------------------------
    # Session / auth
    # ------------------------------------------------------------------

    def session_seconds_remaining(self) -> float:
        if self.session is None:
            return float("inf")
        return (self.session.expires_at_ist - self.server_now_ist()).total_seconds()

    def _auth_headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        if not self.auth_token:
            raise UnauthorizedError("Not logged in: call login() first.")
        headers = {"ttd-auth-token": self.auth_token}
        if extra:
            headers.update(extra)
        return headers

    async def ensure_session_valid(self, min_seconds: float = SESSION_SAFETY_SECONDS) -> bool:
        remaining = self.session_seconds_remaining()
        if remaining >= min_seconds:
            return False
        if self._credentials is None:
            raise SessionExpiredError(
                f"Session has {remaining:.0f}s left (< {min_seconds:.0f}s) and no credentials cached."
            )

        logger.info(
            "Session expiring in {:.0f}s (< {:.0f}s); re-authenticating",
            remaining,
            min_seconds,
        )
        await self.login(self._credentials)
        await self.get_user_context()
        return True

    # ------------------------------------------------------------------
    # Logging / errors
    # ------------------------------------------------------------------

    async def _log_request(self, request: httpx.Request) -> None:
        sensitive_headers = {"ttd-auth-token", "x-payment-nonce", "authorization", "cookie"}
        shown_headers: dict[str, str] = {}
        for name in ("content-type", "ttd-auth-token", "x-payment-nonce"):
            value = request.headers.get(name)
            if value is not None:
                shown_headers[name] = "<redacted>" if name in sensitive_headers else value

        path = request.url.path
        sensitive_path = path in {
            "/v1/authenticate",
            "/dms/srivaniCurrentDayDarshanBooking",
            "/dms/srivaniAdvanceDarshanBooking",
        }
        try:
            raw = request.content or b""
        except Exception:
            raw = b""

        body = "<redacted>"
        if not sensitive_path and b"password" not in raw[:2048].lower():
            body = raw.decode("utf-8", errors="replace")

        logger.debug(
            "→ {} {} headers={} body={}",
            request.method,
            path,
            shown_headers,
            body if body else "<empty>",
        )

    @staticmethod
    def _raise_for_errors(response: httpx.Response) -> dict[str, Any]:
        if 300 <= response.status_code < 400:
            location = response.headers.get("location", "")
            raise SessionExpiredError(
                f"Unexpected redirect ({response.status_code}) from {response.request.url.path}; "
                f"Location={location or '<none>'}"
            )

        if response.status_code == 401:
            raise UnauthorizedError("401 Unauthorized — token missing or expired.")

        if response.status_code == 403:
            try:
                body = response.json()
            except Exception:
                body = {}
            msg = body.get("message") or body.get("error") or response.text
            if "Booking opens at" in msg:
                raise BookingNotOpenError(msg)
            raise ForbiddenError(msg)

        if response.status_code >= 400:
            raise TTDError(f"HTTP {response.status_code}: {response.text}")

        try:
            data = response.json()
        except Exception:
            return {"raw": response.text}

        if isinstance(data, dict) and "error" in data:
            err = str(data["error"])
            raise _ERROR_MAP.get(err, TTDError)(err)
        return data

    # ------------------------------------------------------------------
    # API
    # ------------------------------------------------------------------

    async def login(self, credentials: LoginCredentials) -> LoginResponse:
        self._credentials = credentials
        started_wall = datetime.now(UTC)
        started_mono = time.monotonic()
        resp = await self._client.post(
            "/v1/authenticate",
            data={"username": credentials.username, "password": credentials.password},
            headers={**DEFAULT_HEADERS, "Content-Type": "application/x-www-form-urlencoded"},
        )
        finished_mono = time.monotonic()
        finished_wall = datetime.now(UTC)
        self._observe_response_clock(
            resp,
            started_wall=started_wall,
            finished_wall=finished_wall,
            started_monotonic=started_mono,
            finished_monotonic=finished_mono,
        )

        data = self._raise_for_errors(resp)
        token = resp.headers.get("ttd-auth-token")
        if not token:
            raise TTDError("Login succeeded but no ttd-auth-token header returned.")

        self.auth_token = token
        self.payment_nonce = None
        parsed = LoginResponse.model_validate(data)
        self.user_id = parsed.userId
        logger.info("Login OK: userId={} token=<redacted>", parsed.userId)
        return parsed

    async def get_user_context(self) -> UserContext:
        resp = await self._client.post(
            "/user/getUserContext",
            headers=self._auth_headers(),
            content=b"",
        )
        self._sync_server_time(resp)
        parsed = UserContext.model_validate(self._raise_for_errors(resp))
        self.user_context = parsed

        try:
            started = datetime.strptime(parsed.sessionStartTime, "%Y-%m-%d %H:%M:%S.%f").replace(
                tzinfo=IST
            )
        except ValueError:
            started = datetime.strptime(
                parsed.sessionStartTime.split(".")[0], "%Y-%m-%d %H:%M:%S"
            ).replace(tzinfo=IST)

        try:
            timeout_s = int(parsed.timeOutPeriod)
        except (TypeError, ValueError):
            timeout_s = 0

        self.session = SessionInfo(
            started_at_ist=started,
            timeout_seconds=timeout_s,
        )
        logger.info(
            "Session: start={} IST timeout={}s expires={} IST remaining≈{:.0f}s offset={:+.3f}s",
            started.strftime("%H:%M:%S"),
            timeout_s,
            self.session.expires_at_ist.strftime("%H:%M:%S"),
            self.session_seconds_remaining(),
            self._server_offset.total_seconds(),
        )
        return parsed

    async def get_user_detail(self, user_id: str | int | None = None) -> UserDetail:
        uid = user_id or self.user_id
        if uid is None:
            raise ValueError("user_id required.")
        resp = await self._client.post(
            f"/common/getUserDetail/{uid}",
            headers=self._auth_headers(),
            content=b"",
        )
        self._sync_server_time(resp)
        return UserDetail.model_validate(self._raise_for_errors(resp))

    async def get_no_of_persons(self, donation_amount: int) -> NoOfPersonsResponse:
        resp = await self._client.post(
            f"/dms/getnoOfPersons/{donation_amount}",
            headers=self._auth_headers(),
            content=b"",
        )
        self._sync_server_time(resp)
        return NoOfPersonsResponse.model_validate(self._raise_for_errors(resp))

    async def get_banks(self) -> list[dict[str, Any]]:
        resp = await self._client.get("/common/banks")
        self._sync_server_time(resp)
        data = self._raise_for_errors(resp)
        if isinstance(data, dict) and "bankList" in data:
            return list(data["bankList"])
        return []

    async def darshan_summary_current_day(self) -> CurrentDaySummary:
        resp = await self._client.post(
            "/dms/darshansummarySrivaniCurrentDay",
            headers=self._auth_headers(),
            content=b"",
        )
        self._sync_server_time(resp)
        return CurrentDaySummary.model_validate(self._raise_for_errors(resp))

    async def continue_booking(self) -> ContinueResponse:
        """Single current-day nonce acquisition (one attempt).

        For fan-out, use continue_booking_race(). This method is still not
        auto-retried by httpx (transport retries=0).
        """
        started = time.monotonic()
        resp = await self._client.post(
            "/dms/continue",
            headers=self._auth_headers(),
            content=b"",
            timeout=CONTINUE_TIMEOUT,
        )
        elapsed = time.monotonic() - started
        self._sync_server_time(resp)
        parsed = ContinueResponse.model_validate(self._raise_for_errors(resp))
        self.payment_nonce = parsed.paymentNonce
        logger.info(
            "Continue: {:.3f}s; nonce acquired",
            elapsed,
        )
        return parsed

    async def book_current_day(self, request: CurrentDayBookingRequest) -> BookingResponse:
        if not self.payment_nonce:
            raise TTDError("payment nonce missing — call continue_booking() first.")
        resp = await self._client.post(
            "/dms/srivaniCurrentDayDarshanBooking",
            headers=self._auth_headers({"X-Payment-Nonce": self.payment_nonce}),
            json=request.model_dump(mode="json"),
        )
        self._sync_server_time(resp)
        return BookingResponse.model_validate(self._raise_for_errors(resp))

    async def _continue_attempt(self, idx: int, stagger_seconds: float) -> ContinueResponse:
        if stagger_seconds > 0 and idx > 0:
            await asyncio.sleep(stagger_seconds * idx)
        return await self.continue_booking()

    async def continue_booking_race(
        self,
        *,
        attempts: int = 3,
        stagger_seconds: float = 0.0,
    ) -> ContinueResponse:
        """Fire `attempts` concurrent /dms/continue calls; return first nonce."""
        if attempts < 1:
            raise ValueError("attempts must be >= 1")
        if attempts == 1:
            return await self.continue_booking()

        tasks = [
            asyncio.create_task(
                self._continue_attempt(i, stagger_seconds),
                name=f"continue-{i + 1}",
            )
            for i in range(attempts)
        ]
        logger.info(
            "Racing {} Continue attempts (stagger={:.2f}s)",
            attempts,
            stagger_seconds,
        )
        # Each concurrent response updates payment_nonce inside continue_booking().
        # Restore the winner's nonce after the race to prevent a late response from
        # a losing attempt from overwriting it.
        winner = await _race_success(
            tasks,
            name="Continue",
            warn_on_duplicate_success=False,
        )
        self.payment_nonce = winner.paymentNonce
        return winner

    async def _book_current_day_attempt(
        self,
        request: CurrentDayBookingRequest,
        idx: int,
        stagger_seconds: float,
    ) -> BookingResponse:
        if stagger_seconds > 0 and idx > 0:
            await asyncio.sleep(stagger_seconds * idx)
        return await self.book_current_day(request)

    async def book_current_day_race(
        self,
        request: CurrentDayBookingRequest,
        *,
        attempts: int = 2,
        stagger_seconds: float = 0.0,
    ) -> BookingResponse:
        """Fire `attempts` concurrent booking POSTs; return first orderId.

        WARNING: booking is **not** idempotent. Cancelling a losing attempt does
        not undo a server-side booking. Default is 2; reconcile booking history
        if the "ALSO succeeded" warning ever fires.
        """
        if attempts < 1:
            raise ValueError("attempts must be >= 1")
        if attempts == 1:
            return await self.book_current_day(request)

        tasks = [
            asyncio.create_task(
                self._book_current_day_attempt(request, i, stagger_seconds),
                name=f"book-{i + 1}",
            )
            for i in range(attempts)
        ]
        logger.info(
            "Racing {} booking attempts (stagger={:.2f}s) — duplicates will NOT be auto-rolled back",
            attempts,
            stagger_seconds,
        )
        winner = await _race_success(tasks, name="Booking", warn_on_duplicate_success=True)
        if attempts > 1:
            logger.warning(
                "Booking race retained the first orderId={}; other cancelled POSTs may still have "
                "been processed server-side. Check TTD booking/payment history before retrying.",
                winner.orderId,
            )
        return winner

    async def create_razorpay_checkout_payload(
        self,
        *,
        payment_params: dict[str, Any],
    ) -> dict[str, Any]:
        """Create the Razorpay order once and return data compatible with razorpay.js.

        This is intentionally a single POST with no retry. The returned payload
        includes the login token and payment nonce, so callers must store it privately.
        It prepares checkout; it does not make or verify a payment.
        """
        if not self.auth_token:
            raise UnauthorizedError("Cannot initialize Razorpay without a login token.")
        if not self.payment_nonce:
            raise TTDError("Cannot initialize Razorpay without the Continue payment nonce.")

        started = time.monotonic()
        response = await self._client.post(
            "/wlpgpayment/razorpaymentDetails",
            headers=self._auth_headers({"X-Payment-Nonce": self.payment_nonce}),
            json=payment_params,
        )
        elapsed = time.monotonic() - started
        self._sync_server_time(response)
        data = self._raise_for_errors(response)

        razorpay_order_id = data.get("orderid") or data.get("orderId")
        key_id = data.get("keyId")
        if not isinstance(razorpay_order_id, str) or not razorpay_order_id.strip():
            raise TTDError("Razorpay initialization response did not contain an orderid.")
        if not isinstance(key_id, str) or not key_id.strip():
            raise TTDError("Razorpay initialization response did not contain a keyId.")

        logger.info("Razorpay details: {:.3f}s; checkout order initialized", elapsed)
        return {
            "token": self.auth_token,
            "nonce": self.payment_nonce,
            "orderId": razorpay_order_id,
            "keyId": key_id,
            "paymentParams": payment_params,
        }

    async def darshan_summary(
        self,
        darshan_id_list: list[int] | None = None,
        channel_type_id: int = ChannelType.ONLINE.value,
        role_name: str = "ROLE_PILGRIM",
    ) -> DarshanSummaryResponse:
        body = {
            "channelTypeId": channel_type_id,
            "darshanIdList": darshan_id_list or [DarshanType.FUTURE.value],
            "roleName": role_name,
        }
        resp = await self._client.post(
            "/dms/darshansummary",
            headers=self._auth_headers(),
            json=body,
        )
        self._sync_server_time(resp)
        return DarshanSummaryResponse.model_validate(self._raise_for_errors(resp))

    async def book_advance(self, request: AdvanceBookingRequest) -> BookingResponse:
        resp = await self._client.post(
            "/dms/srivaniAdvanceDarshanBooking",
            headers=self._auth_headers(),
            json=request.model_dump(mode="json"),
        )
        self._sync_server_time(resp)
        return BookingResponse.model_validate(self._raise_for_errors(resp))


# ----------------------------------------------------------------------
# Waiting / scheduling
# ----------------------------------------------------------------------


async def _sleep_chunked(seconds: float) -> None:
    end = time.monotonic() + max(0.0, seconds)
    while True:
        remaining = end - time.monotonic()
        if remaining <= 0:
            return
        # Normal sleep is coarse, but use shorter sleeps near the release boundary
        # so we don't add an avoidable ~1s scheduling delay.
        if remaining > 2.0:
            delay = min(remaining - 0.5, SLEEP_CHUNK_SECONDS)
        elif remaining > 0.25:
            delay = min(remaining - 0.05, 0.20)
        else:
            delay = min(remaining, 0.02)
        await asyncio.sleep(max(0.001, delay))


async def _wait_until_current_release(
    ttd: TTDClient,
    creds: LoginCredentials,
    release_hhmmss: str,
    *,
    probe_lead_seconds: float = CLOCK_PROBE_LEAD_SECONDS,
) -> None:
    """Wait for release while refreshing clock + HTTP/2 connection at T-30s.

    The probe is deliberately sent to /common/activeEnv rather than /dms/continue.
    It does not consume the Continue nonce flow and is used only for clock sync and
    transport warm-up.
    """
    while True:
        wait_s = ttd.seconds_until(release_hhmmss)
        if wait_s <= 0:
            logger.info(
                "Server time is already at/past release: {} IST",
                release_hhmmss,
            )
            return

        remaining = ttd.session_seconds_remaining()
        session_timeout = ttd.session.timeout_seconds if ttd.session else 0

        # Ensure a newly-authenticated session can cover release + safety margin.
        if remaining < wait_s + SESSION_SAFETY_SECONDS:
            latest_reauth_delay = max(
                0.0,
                wait_s + SESSION_SAFETY_SECONDS - session_timeout,
            )
            reauth_deadline_delay = max(0.0, remaining - RENEW_LEAD_SECONDS)
            sleep_s = min(latest_reauth_delay, reauth_deadline_delay, wait_s)
            if sleep_s > 0:
                logger.info("Session coverage insufficient; reauth in {:.1f}s", sleep_s)
                await _sleep_chunked(sleep_s)
            logger.info("Re-authenticating before release")
            await ttd.login(creds)
            await ttd.get_user_context()
            continue

        # Do the one intentional low-cost probe approximately T-30s.
        probe_wait = wait_s - probe_lead_seconds
        if probe_wait > 0:
            logger.info(
                "Waiting {:.1f}s until clock/connection probe at T-{:.0f}s",
                probe_wait,
                probe_lead_seconds,
            )
            await _sleep_chunked(probe_wait)

        current_wait = ttd.seconds_until(release_hhmmss)
        await ttd.ensure_session_valid(min_seconds=current_wait + SESSION_SAFETY_SECONDS)

        # Refresh the clock. In NTP / BOTH mode, NTP is authoritative.
        if ttd.clock_source in (ClockSource.NTP, ClockSource.BOTH):
            try:
                ntp = await ttd.sync_ntp()
                logger.info(
                    "Pre-release NTP: server={} offset={:+.3f}s delay={:.3f}s",
                    ntp.server,
                    ntp.offset_seconds,
                    ntp.delay_seconds,
                )
            except TTDError as exc:
                logger.warning("NTP sync failed at T-30 ({}); falling back to last anchor", exc)

        # Always hit a cheap TTD endpoint: it warms the HTTP/2 connection.
        # In TTD mode it is the primary clock sync; in NTP/BOTH it is a cross-check.
        try:
            sample = await ttd.probe_server_clock()
            if ttd.clock_source == ClockSource.TTD:
                logger.info(
                    "Pre-release sync: RTT={:.3f}s offset={:+.3f}s server={}",
                    sample.rtt_seconds,
                    sample.offset_seconds,
                    ttd.server_now_ist().strftime("%H:%M:%S.%f")[:-3],
                )
            elif ttd.clock_source == ClockSource.BOTH and ttd._ntp_anchor_utc is not None:
                ttd_off = sample.offset_seconds
                ntp_off = ttd._ntp_offset.total_seconds()
                drift = ttd_off - ntp_off
                if abs(drift) > 1.0:
                    logger.warning(
                        "Clock source disagreement: TTD={:+.3f}s NTP={:+.3f}s (Δ={:+.3f}s); using NTP",
                        ttd_off,
                        ntp_off,
                        drift,
                    )
                else:
                    logger.debug(
                        "Cross-check OK: TTD={:+.3f}s NTP={:+.3f}s (Δ={:+.3f}s)",
                        ttd_off,
                        ntp_off,
                        drift,
                    )
        except TTDError as exc:
            logger.warning(
                "Pre-release TTD warm-up probe failed: {}; continuing with last estimate", exc
            )

        # Recompute against the fresh anchor.
        remaining_after_probe = ttd.seconds_until(release_hhmmss)
        if remaining_after_probe > 0:
            logger.info(
                "Release in {:.3f}s at {} IST (source={})",
                remaining_after_probe,
                release_hhmmss,
                ttd.clock_source.value,
            )
            await _sleep_chunked(remaining_after_probe)
        return


def _summary_missing_release_fields(summary: CurrentDaySummary) -> list[str]:
    """Return summary fields that must be populated before current-day booking."""
    required = {
        "slottime": summary.slottime,
        "minpersons": summary.minpersons,
        "maxpersons": summary.maxpersons,
        "advanceminpersons": summary.advanceminpersons,
        "advancemaxpersons": summary.advancemaxpersons,
    }
    return [
        name for name, value in required.items() if not isinstance(value, str) or not value.strip()
    ]


async def _refresh_summary_near_release(
    ttd: TTDClient,
    summary: CurrentDaySummary,
    *,
    skip_wait: bool = False,
    lead_seconds: float = SUMMARY_REFRESH_LEAD_SECONDS,
) -> CurrentDaySummary:
    """Refresh the partial current-day summary near T-2 minutes.

    Early summary calls are expected to contain null slot/person-limit fields. We
    wait until the configured lead time, fetch again, and allow a few low-frequency
    retries if the first near-release response is still propagating. We never use
    stale placeholder values to submit a booking.
    """
    release_time = summary.quotaReleaseTime
    if not release_time or not release_time.strip():
        raise TTDError(
            "Initial summary has no quotaReleaseTime; cannot schedule the T-2 refresh safely."
        )

    if skip_wait:
        logger.warning("--skip-wait set; refreshing current-day summary immediately")
    else:
        until_refresh = ttd.seconds_until(release_time) - lead_seconds
        if until_refresh > 0:
            logger.info(
                "Initial summary may be partial; waiting {:.1f}s until refresh at T-{:.0f}s",
                until_refresh,
                lead_seconds,
            )
            await _sleep_chunked(until_refresh)
        else:
            logger.info(
                "Within {:.0f}s of release; refreshing current-day summary now",
                lead_seconds,
            )

    refreshed: CurrentDaySummary | None = None
    missing: list[str] = []
    for attempt in range(1, SUMMARY_REFRESH_MAX_ATTEMPTS + 1):
        refreshed = await ttd.darshan_summary_current_day()
        missing = _summary_missing_release_fields(refreshed)
        if not missing:
            break
        if attempt < SUMMARY_REFRESH_MAX_ATTEMPTS:
            logger.warning(
                "Near-release summary attempt {}/{} still has null fields: {}; retrying in {:.1f}s",
                attempt,
                SUMMARY_REFRESH_MAX_ATTEMPTS,
                ", ".join(missing),
                SUMMARY_REFRESH_RETRY_DELAY_SECONDS,
            )
            await _sleep_chunked(SUMMARY_REFRESH_RETRY_DELAY_SECONDS)

    if refreshed is None or missing:
        raise TTDError(
            "Current-day summary remained incomplete near release; missing fields: "
            + ", ".join(missing)
            + ". Aborting before Continue/booking rather than using stale values."
        )

    if refreshed.quotaReleaseTime != release_time:
        logger.warning(
            "quotaReleaseTime changed during refresh: {} -> {} IST; using latest value",
            release_time,
            refreshed.quotaReleaseTime,
        )

    logger.info(
        "Refreshed summary ready: slot={} minpersons={} maxpersons={} "
        "advance_min={} advance_max={} release={} IST",
        refreshed.slottime,
        refreshed.minpersons,
        refreshed.maxpersons,
        refreshed.advanceminpersons,
        refreshed.advancemaxpersons,
        refreshed.quotaReleaseTime,
    )
    return refreshed


# ----------------------------------------------------------------------
# Pilgrim parsing
# ----------------------------------------------------------------------


def _pilgrim_from_inline(spec: str) -> Pilgrim:
    parts = spec.split(":")
    if len(parts) != 5:
        raise DonationRuleError(
            f"--pilgrim expects NAME:AGE:GENDER:ID_TYPE:ID_NUMBER, got {spec!r}"
        )
    name, age_s, gender_s, idtype_s, idnum = (part.strip() for part in parts)
    try:
        age = int(age_s)
    except ValueError as exc:
        raise DonationRuleError(f"Bad age in {spec!r}: {age_s!r}") from exc

    gender = _GENDER_BY_NAME.get(gender_s.lower())
    if gender is None:
        raise DonationRuleError(f"Bad gender {gender_s!r}; use M/F/O (or male/female/other).")

    id_type = _ID_TYPE_BY_NAME.get(idtype_s.lower())
    if id_type is None:
        raise DonationRuleError(f"Bad ID type {idtype_s!r}; use one of {sorted(_ID_TYPE_BY_NAME)}.")

    return Pilgrim(
        piligrimName=name,
        piligrimAge=age,
        piligrimGender=gender,
        piligrimIdProofType=id_type,
        idProofNumber=idnum,
    )


def load_pilgrims(
    *,
    inline: list[str] | None,
    file_path: str | None,
    fallback_count: int | None,
) -> list[Pilgrim]:
    if inline:
        if file_path:
            logger.warning("--pilgrim overrides --pilgrims-file")
        pilgrims = [_pilgrim_from_inline(spec) for spec in inline]
    elif file_path:
        with open(file_path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
        if not isinstance(raw, list):
            raise DonationRuleError(f"{file_path}: expected a JSON array of pilgrim objects.")
        pilgrims = [Pilgrim.model_validate(item) for item in raw]
    elif fallback_count is not None:
        logger.warning(
            "No pilgrim details supplied; using placeholders. Do not submit a real booking with these."
        )
        pilgrims = [
            Pilgrim(
                piligrimName=f"PILGRIM {i + 1}",
                piligrimAge=30 + i,
                piligrimGender=Gender.MALE,
                piligrimIdProofType=IDTypes.AADHAR,
                idProofNumber="000000000000",
            )
            for i in range(fallback_count)
        ]
    else:
        raise DonationRuleError("No pilgrim details supplied. Use --pilgrim or --pilgrims-file.")

    if not 1 <= len(pilgrims) <= MAX_PILGRIMS_PER_BOOKING:
        raise DonationRuleError(
            f"Need 1..{MAX_PILGRIMS_PER_BOOKING} pilgrims, got {len(pilgrims)}."
        )
    return pilgrims


def write_private_json(path_value: str, data: dict[str, Any]) -> Path:
    """Write a checkout handoff file with owner-only permissions where supported."""
    path = Path(path_value).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    path.write_text(serialized, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        # Windows and some mounted filesystems may not support POSIX file modes.
        pass
    return path.resolve()


# ----------------------------------------------------------------------
# Flows
# ----------------------------------------------------------------------


async def run_current(
    creds: LoginCredentials,
    *,
    pilgrims: list[Pilgrim],
    slot_id: int,
    slot_name_override: str | None,
    dry_run: bool,
    skip_wait: bool = False,
    probe_lead_seconds: float = CLOCK_PROBE_LEAD_SECONDS,
    pg_id: int = DEFAULT_RAZORPAY_PG_ID,
    payment_payload_out: str | None = "razorpay_checkout_payload.json",
    skip_payment_init: bool = False,
    donation_amount: int | None = None,
    continue_attempts: int = 3,
    booking_attempts: int = 2,
    attempt_stagger_seconds: float = 0.0,
    clock_source: ClockSource = ClockSource.TTD,
    ntp_servers: list[str] | None = None,
    ntp_timeout: float = NTP_TIMEOUT_SECONDS,
) -> dict[str, Any] | None:
    num_pilgrims = len(pilgrims)
    donation = (
        donation_amount if donation_amount is not None else num_pilgrims * DONATION_PER_PILGRIM
    )
    if donation < num_pilgrims * DONATION_PER_PILGRIM:
        raise DonationRuleError(
            f"Donation must be at least ₹{num_pilgrims * DONATION_PER_PILGRIM:,} "
            f"for {num_pilgrims} pilgrim(s)."
        )

    async with TTDClient(
        clock_source=clock_source,
        ntp_servers=ntp_servers,
        ntp_timeout=ntp_timeout,
    ) as ttd:
        # Initial clock sync at startup.
        if ttd.clock_source in (ClockSource.NTP, ClockSource.BOTH):
            try:
                r = await ttd.sync_ntp()
                logger.info(
                    "Initial NTP anchor: offset={:+.3f}s delay={:.3f}s",
                    r.offset_seconds,
                    r.delay_seconds,
                )
            except TTDError as exc:
                logger.warning("Initial NTP sync failed: {}; will retry at T-30s", exc)
        logger.info("Clock source: {}", ttd.clock_source.value)

        # Authenticate, then gather pre-release data in parallel.
        logger.info("HTTP helper: authenticating with TTD")
        await ttd.login(creds)
        logger.info("HTTP helper: login complete; loading session context")
        await ttd.get_user_context()
        logger.info(
            "HTTP helper: session ready; fetching profile, person count, current-day summary, and payment gateways"
        )

        detail, persons, summary, banks = await asyncio.gather(
            ttd.get_user_detail(),
            ttd.get_no_of_persons(donation),
            ttd.darshan_summary_current_day(),
            ttd.get_banks(),
        )
        logger.info("HTTP helper: initial profile/quota/gateway requests completed")

        selected_bank = next((b for b in banks if str(b.get("pgId")) == str(pg_id)), None)
        if not skip_payment_init and selected_bank is None:
            logger.error(
                "Gateway pgId={} was not returned by /common/banks; stopping before booking. "
                "Check the current gateway list and retry with --pg-id.",
                pg_id,
            )
            return

        bank_name = (
            str(selected_bank.get("paymentGatewayName", "unknown")) if selected_bank else "skipped"
        )
        logger.info("Pilgrim: {} (userId={})", detail.userFirstName, detail.userId)
        logger.info(
            "Fan-out: continue×{} booking×{} stagger={:.2f}s",
            continue_attempts,
            booking_attempts,
            attempt_stagger_seconds,
        )
        logger.info(
            "₹{:,} donation; booking {} pilgrim(s); early-summary darshan fee ₹{:,}",
            donation,
            num_pilgrims,
            summary.darshanAmount,
        )
        logger.info(
            "Early summary: slot={} release={} IST quotaCount={} released={} pending={} clock={}",
            summary.slottime or "<not populated yet>",
            summary.quotaReleaseTime,
            summary.quotaCount,
            summary.released,
            summary.pending,
            ttd.server_now_ist().strftime("%H:%M:%S.%f")[:-3],
        )
        if not skip_payment_init:
            logger.info("Payment gateway selected: {} (pgId={})", bank_name, pg_id)

        # Important: TTD's early summary may legitimately omit slot/person-limit
        # fields. Refresh near T-2 minutes; use only this validated snapshot for the
        # booking payload and payment amount.
        try:
            summary = await _refresh_summary_near_release(
                ttd,
                summary,
                skip_wait=skip_wait,
                lead_seconds=SUMMARY_REFRESH_LEAD_SECONDS,
            )
        except TTDError as exc:
            logger.error("Could not obtain a complete near-release summary: {}", exc)
            return

        if not skip_wait:
            await _wait_until_current_release(
                ttd,
                creds,
                summary.quotaReleaseTime,
                probe_lead_seconds=probe_lead_seconds,
            )
        else:
            logger.warning("--skip-wait set; release wait/probe skipped after summary refresh")

        # Use the configured first-success race; the HTTP transport itself never retries.
        await ttd.ensure_session_valid(min_seconds=SESSION_SAFETY_SECONDS)
        try:
            await ttd.continue_booking_race(
                attempts=continue_attempts,
                stagger_seconds=attempt_stagger_seconds,
            )
        except BookingNotOpenError as exc:
            logger.error("Continue: window not open — {}", exc)
            return
        except TooManyHitsError as exc:
            logger.error("Continue: server rate-limited — {}", exc)
            return
        except NetworkAnomalyError as exc:
            logger.error("Continue: server flagged request — {}", exc)
            return
        except TTDError as exc:
            logger.error("Continue failed: {}", exc)
            return

        if dry_run:
            logger.warning("Dry run — nonce acquired but booking call suppressed")
            return

        today_str = ttd.server_now_ist().strftime("%d-%b-%Y")
        # The site frontend multiplies the per-pilgrim darshan fee by pilgrim count.
        darshan_total = summary.darshanAmount * num_pilgrims
        total_amount = donation + darshan_total
        try:
            req = CurrentDayBookingRequest(
                darshanDate=today_str,
                userId=str(detail.userId),
                darshanAmount=darshan_total,
                donationAmount=donation,
                totalAmount=total_amount,
                noOfPersons=str(num_pilgrims),
                slotId=slot_id,
                slotName=slot_name_override or summary.slottime,
                darshanBookingPilgrimList=pilgrims,
            )
        except DonationRuleError as exc:
            logger.error("Invalid booking request: {}", exc)
            return

        try:
            booking = await ttd.book_current_day_race(
                req,
                attempts=booking_attempts,
                stagger_seconds=attempt_stagger_seconds,
            )
        except QuotaExceededError as exc:
            logger.warning("Quota exceeded: {}", exc)
            return
        except InvalidBookingDateError as exc:
            logger.error("Wrong date: {}", exc)
            return
        except BookingNotOpenError as exc:
            logger.warning("Window still closed: {}", exc)
            return
        except (NetworkAnomalyError, TooManyHitsError) as exc:
            logger.error("Transient rejection: {}", exc)
            return
        except UnauthorizedError as exc:
            logger.error("Auth lost mid-flight: {}", exc)
            return
        except TTDError as exc:
            logger.exception("Booking failed: {}", exc)
            return

        logger.success("TTD booking created → orderId={}", booking.orderId)
        if skip_payment_init:
            logger.info("--skip-payment-init set; stopping after TTD booking response")
            return

        # Match the browser's payment-init request captured in the supplied HAR.
        payment_params: dict[str, Any] = {
            "amount": req.totalAmount,
            "firstName": detail.userFirstName or "",
            "lastName": detail.userLastName,
            "pgId": str(pg_id),
            "userId": "a",
            "email": detail.userEmail or "",
            "orderId": booking.orderId,  # TTD booking order ID, not Razorpay order ID.
            "currency": "INR",
            "behalf": "",
            "modName": "EDON",
            "mobileNumber": detail.userPhoneMobile or "",
            "address": "",
            "trustId": SRIVANI_TRUST_ID,
            "trustName": SRIVANI_TRUST_NAME,
        }
        try:
            checkout_payload = await ttd.create_razorpay_checkout_payload(
                payment_params=payment_params,
            )
            payload_path = (
                write_private_json(payment_payload_out, checkout_payload)
                if payment_payload_out is not None
                else None
            )
        except TTDError as exc:
            logger.exception(
                "TTD booking exists, but Razorpay checkout initialization failed: {}. "
                "Do not repeat the booking request; check booking/transaction history first.",
                exc,
            )
            return None
        except OSError as exc:
            logger.exception(
                "Razorpay order was initialized, but the handoff file could not be written: {}. "
                "Do not repeat booking or payment initialization blindly.",
                exc,
            )
            return None

        if payload_path is not None:
            logger.success("Razorpay order initialized; checkout handoff saved to {}", payload_path)
            logger.warning(
                "Handoff file contains a login token and payment nonce. Keep it private and delete it "
                "after use. Paste its JSON into the Razorpay helper running in the TTD page, "
                "then press Pay to open checkout. This script does not submit payment or confirm payment success."
            )
        else:
            logger.success("Razorpay order initialized; checkout handoff is ready in memory")
            logger.warning(
                "Checkout payload contains a login token and payment nonce. It is being passed "
                "directly to the local browser handoff and is not written to disk."
            )
        return checkout_payload


async def run_future(
    creds: LoginCredentials,
    *,
    date_str: str,
    slot_id: int,
    slot_name: str,
    pilgrims: list[Pilgrim],
    dry_run: bool,
    clock_source: ClockSource = ClockSource.TTD,
    ntp_servers: list[str] | None = None,
    ntp_timeout: float = NTP_TIMEOUT_SECONDS,
) -> None:
    num_pilgrims = len(pilgrims)
    donation = num_pilgrims * DONATION_PER_PILGRIM

    async with TTDClient(
        clock_source=clock_source,
        ntp_servers=ntp_servers,
        ntp_timeout=ntp_timeout,
    ) as ttd:
        if ttd.clock_source in (ClockSource.NTP, ClockSource.BOTH):
            try:
                await ttd.sync_ntp()
            except TTDError as exc:
                logger.warning("Initial NTP sync failed: {}", exc)

        await ttd.login(creds)
        await ttd.get_user_context()

        detail, summary = await asyncio.gather(
            ttd.get_user_detail(),
            ttd.darshan_summary([DarshanType.FUTURE.value]),
        )

        logger.info("Pilgrim: {} (userId={})", detail.userFirstName, detail.userId)
        logger.info(
            "Advance window: {} → {}",
            summary.startAndEndDates[0],
            summary.startAndEndDates[1],
        )
        logger.info("Booked dates: {}", len(summary.bookedDates))
        if date_str in summary.bookedDates:
            logger.warning("{} appears fully booked server-side", date_str)

        await ttd.ensure_session_valid(min_seconds=SESSION_SAFETY_SECONDS)

        try:
            req = AdvanceBookingRequest(
                darshanDate=date_str,
                userId=str(detail.userId),
                darshanAmount=summary.darshanAmount,
                donationAmount=donation,
                totalAmount=donation + summary.darshanAmount,
                noOfPersons=num_pilgrims,
                slotId=slot_id,
                slotName=slot_name,
                darshanBookingPilgrimList=pilgrims,
            )
        except DonationRuleError as exc:
            logger.error("Invalid booking request: {}", exc)
            return

        if dry_run:
            logger.warning("Dry run — not sending booking call")
            return

        try:
            booking = await ttd.book_advance(req)
            logger.success("Booked → orderId={}", booking.orderId)
        except QuotaExceededError as exc:
            logger.warning("Quota exceeded: {}", exc)
        except (NetworkAnomalyError, TooManyHitsError) as exc:
            logger.error("Transient rejection: {}", exc)
        except UnauthorizedError as exc:
            logger.error("Auth lost mid-flight: {}", exc)
        except TTDError as exc:
            logger.exception("Booking failed: {}", exc)


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--pilgrims",
        type=int,
        default=None,
        choices=range(1, MAX_PILGRIMS_PER_BOOKING + 1),
        metavar=f"1..{MAX_PILGRIMS_PER_BOOKING}",
        help="Fallback placeholder count; real bookings should use --pilgrim or --pilgrims-file.",
    )
    parser.add_argument(
        "--pilgrims-file",
        metavar="PATH",
        help="JSON file containing pilgrim objects.",
    )
    parser.add_argument(
        "--pilgrim",
        action="append",
        metavar="NAME:AGE:GENDER:ID_TYPE:ID_NUMBER",
        help="Single pilgrim; can be repeated. Overrides --pilgrims-file.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run validations/timing and acquire the Current-Day nonce, but do not submit the booking call.",
    )
    parser.add_argument(
        "--clock-source",
        choices=[c.value for c in ClockSource],
        default=ClockSource.TTD.value,
        help=(
            "Time sync source: 'ttd' (HTTP Date headers, default), "
            "'ntp' (SNTP over UDP), or 'both' (NTP authoritative + TTD cross-check)."
        ),
    )
    parser.add_argument(
        "--ntp-server",
        action="append",
        metavar="HOST",
        help=("NTP server (repeatable). Defaults: " + ", ".join(DEFAULT_NTP_SERVERS)),
    )
    parser.add_argument(
        "--ntp-timeout",
        type=float,
        default=NTP_TIMEOUT_SECONDS,
        metavar="SECONDS",
        help=f"Timeout per NTP query (default: {NTP_TIMEOUT_SECONDS})",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Async TTD SRIVANI booking client")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--example-pilgrims", action="store_true")
    parser.add_argument("--username", default=os.environ.get("TTD_USERNAME"))
    parser.add_argument("--password", default=os.environ.get("TTD_PASSWORD"))

    sub = parser.add_subparsers(dest="mode", required=True)

    p_cur = sub.add_parser("current", help="Current-day SRIVANI booking")
    p_cur.add_argument("--slot-id", type=int, default=31)
    p_cur.add_argument("--slot-name", default=None)
    p_cur.add_argument("--skip-wait", action="store_true")
    p_cur.add_argument(
        "--probe-lead",
        type=float,
        default=CLOCK_PROBE_LEAD_SECONDS,
        help="Seconds before release to run the harmless clock/connection probe (default: 30).",
    )
    p_cur.add_argument(
        "--pg-id",
        type=int,
        default=DEFAULT_RAZORPAY_PG_ID,
        help="Payment gateway ID returned by /common/banks (HAR captured HDFC/Razorpay as 15).",
    )
    p_cur.add_argument(
        "--payment-payload-out",
        default="razorpay_checkout_payload.json",
        metavar="PATH",
        help="Path for the private Razorpay helper JSON after a successful booking.",
    )
    p_cur.add_argument(
        "--skip-payment-init",
        action="store_true",
        help="Stop after a successful TTD booking; do not request Razorpay checkout details.",
    )
    p_cur.add_argument(
        "--continue-attempts",
        type=int,
        default=3,
        metavar="N",
        help="Concurrent /dms/continue calls; first nonce wins (default: 3).",
    )
    p_cur.add_argument(
        "--booking-attempts",
        type=int,
        default=2,
        metavar="N",
        help=(
            "Concurrent /dms/srivaniCurrentDayDarshanBooking calls; first orderId wins "
            "(default: 2). Booking is NOT idempotent — raise this only if you accept "
            "the risk of duplicate bookings that must be reconciled manually."
        ),
    )
    p_cur.add_argument(
        "--attempt-stagger",
        type=float,
        default=0.0,
        metavar="SECONDS",
        help="Delay between successive parallel attempts (default: 0.0).",
    )

    _add_common(p_cur)

    p_fut = sub.add_parser("future", help="Advance/future SRIVANI booking")
    p_fut.add_argument("--date", required=True, metavar="dd-Mon-yyyy")
    p_fut.add_argument("--slot-id", type=int, required=True)
    p_fut.add_argument("--slot-name", default="")
    _add_common(p_fut)

    p_args = parser.parse_args()

    if p_args.example_pilgrims:
        print(
            json.dumps(
                [
                    {
                        "piligrimName": "RANGASWAMY N",
                        "piligrimAge": 62,
                        "piligrimGender": "M",
                        "piligrimIdProofType": 1015,
                        "idProofNumber": "<REDACTED>",
                    }
                ],
                indent=2,
            )
        )
        return

    logger.remove()
    logger.add(
        lambda msg: print(msg, end=""),
        level="DEBUG" if p_args.verbose else "INFO",
        colorize=True,
        format="<green>{time:HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <level>{message}</level>\n",
    )

    if not p_args.username or not p_args.password:
        parser.error(
            "Provide --username/--password or TTD_USERNAME/TTD_PASSWORD environment variables"
        )

    try:
        pilgrims = load_pilgrims(
            inline=p_args.pilgrim,
            file_path=p_args.pilgrims_file,
            fallback_count=p_args.pilgrims,
        )
    except DonationRuleError as exc:
        parser.error(str(exc))

    creds = LoginCredentials(username=p_args.username, password=p_args.password)

    if p_args.mode == "current":
        asyncio.run(
            run_current(
                creds,
                pilgrims=pilgrims,
                slot_id=p_args.slot_id,
                slot_name_override=p_args.slot_name,
                dry_run=p_args.dry_run,
                skip_wait=p_args.skip_wait,
                probe_lead_seconds=p_args.probe_lead,
                pg_id=p_args.pg_id,
                payment_payload_out=p_args.payment_payload_out,
                skip_payment_init=p_args.skip_payment_init,
                continue_attempts=p_args.continue_attempts,
                booking_attempts=p_args.booking_attempts,
                attempt_stagger_seconds=p_args.attempt_stagger,
                clock_source=ClockSource(p_args.clock_source),
                ntp_servers=p_args.ntp_server,
                ntp_timeout=p_args.ntp_timeout,
            )
        )
    else:
        asyncio.run(
            run_future(
                creds,
                date_str=p_args.date,
                slot_id=p_args.slot_id,
                slot_name=p_args.slot_name,
                pilgrims=pilgrims,
                dry_run=p_args.dry_run,
                clock_source=ClockSource(p_args.clock_source),
                ntp_servers=p_args.ntp_server,
                ntp_timeout=p_args.ntp_timeout,
            )
        )


if __name__ == "__main__":
    main()
