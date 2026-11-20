from __future__ import annotations

import sys
from uuid import uuid4

from loguru import logger

from app.core.config import settings
from app.core.task_logs import task_log_store


def configure_logging(level: str | None = None) -> None:
    level = level or settings.LOG_LEVEL
    logger.remove()
    logger.configure(
        extra={
            "request_id": "-",
            "job_id": "-",
            "worker_id": "-",
            "task_type": "-",
            "event": "-",
            "service": settings.SERVICE_NAME,
            "ENV": settings.ENVIRONMENT,
        }
    )

    # PyInstaller --noconsole applications may have no stdout at all. Keep
    # console logging when running normally, but never let a missing stream
    # prevent the backend from starting.
    if sys.stdout is not None:
        logger.add(
            sys.stdout,
            level=level,
            colorize=True,
            diagnose=False,
            format=(
                "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
                "<level>{level: <8}</level> | "
                "<cyan>{extra[request_id]}</cyan> | "
                "<magenta>{extra[job_id]}</magenta> | "
                "<yellow>W{extra[worker_id]}</yellow> | {message}"
            ),
        )

    logger.add(task_log_store, level="DEBUG", diagnose=False)


def request_id() -> str:
    return uuid4().hex[:12]
