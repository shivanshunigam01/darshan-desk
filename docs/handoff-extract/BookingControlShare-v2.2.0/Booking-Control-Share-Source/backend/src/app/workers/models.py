from __future__ import annotations

from datetime import date, datetime, timezone
from enum import StrEnum
from typing import Any, Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TaskStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class TaskType(StrEnum):
    TTD = "TTD"


class Task(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    type: TaskType = TaskType.TTD
    status: TaskStatus = TaskStatus.PENDING
    worker_id: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: datetime | None = None
    completed_at: datetime | None = None


MAX_PILGRIMS_PER_BOOKING = 4
DONATION_PER_PILGRIM_SLOT = 10_000
MAX_AUTO_BOOKINGS_PER_REQUEST = 100

GenderLiteral = Literal["M", "F", "T"]
IdTypeLiteral = Literal["Aadhaar Card", "Passport"]
RequestModeLiteral = Literal["manual", "auto"]
BookingTypeLiteral = Literal["current", "future"]
BookingStrategyLiteral = Literal["browser", "http_payload"]
ClockSourceLiteral = Literal["ttd", "ntp", "both"]

TTD_TIMEZONE = ZoneInfo("Asia/Kolkata")
MIN_ADDITIONAL_LADDUS = 1
MAX_ADDITIONAL_LADDUS = 999


class PilgrimDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=1, le=120)
    gender: GenderLiteral
    id_type: IdTypeLiteral
    id_doc_number: str = Field(min_length=1, max_length=64)

    @field_validator("name", "id_doc_number")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class TTDBooking(BaseModel):
    """Credentials and booking data for exactly one automated booking."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    donation: int = Field(ge=DONATION_PER_PILGRIM_SLOT)
    pilgrim_details: list[PilgrimDetail] = Field(
        min_length=1, max_length=MAX_PILGRIMS_PER_BOOKING
    )

    booking_type: BookingTypeLiteral = "current"
    booking_strategy: BookingStrategyLiteral = "browser"
    # HTTP-payload strategy timing controls; browser mode ignores these values.
    clock_source: ClockSourceLiteral = "ttd"
    continue_attempts: int = Field(default=3, ge=1, le=5)
    booking_attempts: int = Field(default=2, ge=1, le=3)
    attempt_stagger_seconds: float = Field(default=0.0, ge=0.0, le=2.0)
    ntp_servers: list[str] = Field(default_factory=list, max_length=5)
    ntp_timeout_seconds: float = Field(default=2.0, gt=0.0, le=10.0)
    future_booking_dates: list[date] = Field(default_factory=list)
    future_booking_forced: bool = False
    additional_laddus: int = -1

    @field_validator("ntp_servers")
    @classmethod
    def _normalize_ntp_servers(cls, value: list[str]) -> list[str]:
        return [host.strip() for host in value if host.strip()]

    @field_validator("additional_laddus")
    @classmethod
    def _validate_additional_laddus_value(cls, value: int) -> int:
        if value == -1:
            return value
        if value < MIN_ADDITIONAL_LADDUS or value > MAX_ADDITIONAL_LADDUS:
            raise ValueError(
                f"additional_laddus must be -1 or between "
                f"{MIN_ADDITIONAL_LADDUS} and {MAX_ADDITIONAL_LADDUS}"
            )
        return value

    @model_validator(mode="after")
    def _validate_booking_options(self) -> "TTDBooking":
        today = datetime.now(TTD_TIMEZONE).date()

        if self.booking_strategy == "http_payload" and self.booking_type != "current":
            raise ValueError(
                "booking_strategy='http_payload' currently supports current-day bookings only"
            )

        if self.booking_type == "future":
            if not self.future_booking_dates:
                raise ValueError("future_booking_dates is required for future booking")

            if len(set(self.future_booking_dates)) != len(self.future_booking_dates):
                raise ValueError("future_booking_dates must not contain duplicate dates")

            invalid_dates = [value for value in self.future_booking_dates if value <= today]
            if invalid_dates:
                raise ValueError(
                    "future_booking_dates must contain only future dates; "
                    f"today is {today.isoformat()}"
                )

            if self.additional_laddus < MIN_ADDITIONAL_LADDUS:
                raise ValueError(
                    f"additional_laddus is required for future booking and must be "
                    f"between {MIN_ADDITIONAL_LADDUS} and {MAX_ADDITIONAL_LADDUS}"
                )
        else:
            if self.future_booking_dates:
                raise ValueError("future_booking_dates must be omitted for current booking")
            if self.future_booking_forced:
                raise ValueError("future_booking_forced is only valid for future booking")

        return self

    @model_validator(mode="after")
    def _validate_pilgrim_count_against_donation(self) -> "TTDBooking":
        max_allowed = min(
            MAX_PILGRIMS_PER_BOOKING,
            self.donation // DONATION_PER_PILGRIM_SLOT,
        )
        if len(self.pilgrim_details) > max_allowed:
            raise ValueError(
                f"donation of {self.donation} only covers {max_allowed} pilgrim "
                f"slot(s) (every {DONATION_PER_PILGRIM_SLOT} rupees opens one, "
                f"capped at {MAX_PILGRIMS_PER_BOOKING}), but "
                f"{len(self.pilgrim_details)} pilgrim_details were given"
            )
        return self


class TTDRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: RequestModeLiteral
    headless: bool = False
    trace: bool = False
    count: int | None = Field(default=None, ge=1, le=100)
    bookings: list[TTDBooking] | None = Field(
        default=None,
        min_length=1,
        max_length=MAX_AUTO_BOOKINGS_PER_REQUEST,
    )

    @model_validator(mode="after")
    def _validate_mode_shape(self) -> "TTDRequest":
        if self.mode == "manual":
            if self.count is None:
                raise ValueError("count is required when mode='manual'")
            if self.bookings is not None:
                raise ValueError("bookings must be omitted when mode='manual'")
            return self

        if self.bookings is None:
            raise ValueError("bookings is required when mode='auto'")
        if self.count is not None:
            raise ValueError("count must be omitted when mode='auto'; use bookings instead")
        return self


class TaskView(BaseModel):
    """Safe task representation for monitoring clients; credentials are never exposed."""

    id: str
    type: TaskType
    status: TaskStatus
    worker_id: int | None
    error: str | None
    result: dict[str, Any] | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    booking_type: BookingTypeLiteral | None = None
    future_booking_date: date | None = None
    future_booking_dates: list[date] = Field(default_factory=list)
    future_booking_forced: bool = False
    additional_laddus: int | None = None
    captcha_required: bool = False
    captcha_status: str | None = None
    captcha_editable: bool = False
    captcha_ocr_text: str | None = None
    captcha_value: str | None = None
    captcha_image_base64: str | None = None
    captcha_attempts: int = 0
    captcha_max_attempts: int = 0
    pilgrim_count: int | None = None
    manual_release_id: str | None = None

    @classmethod
    def from_task(cls, task: Task, client: Any | None = None) -> "TaskView":
        captcha_state = client.get_captcha_state() if client is not None and hasattr(client, "get_captcha_state") else {}

        return cls(
            id=task.id,
            type=task.type,
            status=task.status,
            worker_id=task.worker_id,
            error=task.error,
            result=task.result,
            created_at=task.created_at,
            started_at=task.started_at,
            completed_at=task.completed_at,
            booking_type=task.payload.get("booking_type"),
            future_booking_date=task.payload.get("future_booking_date"),
            future_booking_dates=task.payload.get("future_booking_dates", []) or [],
            future_booking_forced=bool(task.payload.get("future_booking_forced", False)),
            additional_laddus=task.payload.get("additional_laddus"),
            captcha_required=bool(captcha_state.get("required", False)),
            captcha_status=captcha_state.get("status"),
            captcha_editable=bool(captcha_state.get("editable", False)),
            captcha_ocr_text=captcha_state.get("ocr_text"),
            captcha_value=captcha_state.get("value"),
            captcha_image_base64=captcha_state.get("image_base64"),
            captcha_attempts=int(captcha_state.get("attempts", 0) or 0),
            captcha_max_attempts=int(captcha_state.get("max_attempts", 0) or 0),
            pilgrim_count=(
                len(task.payload.get("pilgrim_details", []))
                if isinstance(task.payload.get("pilgrim_details"), list)
                else None
            ),
            manual_release_id=task.payload.get("manual_release_id"),
        )


class TaskSummary(BaseModel):
    id: str
    status: TaskStatus
    created_at: datetime


class EnqueueResponse(BaseModel):
    enqueued: int
    tasks: list[TaskSummary]
    manual_release_id: str | None = None


class ManualReleaseResponse(BaseModel):
    release_id: str
    released: bool
    already_released: bool = False


class HealthResponse(BaseModel):
    status: str
    queue_size: int
    active: int
    max_concurrent: int


class TaskLogsResponse(BaseModel):
    task_id: str
    lines: list[str]


class CaptchaSubmitRequest(BaseModel):
    value: str = Field(min_length=6, max_length=6)

    @field_validator("value", mode="before")
    @classmethod
    def _normalize(cls, value: str) -> str:
        value = value.strip().upper()
        if not value.isalnum():
            raise ValueError("captcha must contain only letters and numbers")
        return value


class ConcurrencyRequest(BaseModel):
    max_concurrent: int = Field(ge=1, le=100)