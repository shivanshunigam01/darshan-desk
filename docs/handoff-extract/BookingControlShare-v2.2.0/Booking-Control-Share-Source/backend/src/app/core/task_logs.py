from __future__ import annotations

from collections import defaultdict, deque
from threading import RLock
from typing import Any


class TaskLogStore:
    """Small in-memory log buffer used by the desktop task monitor."""

    def __init__(self, max_lines_per_task: int = 500) -> None:
        self.max_lines_per_task = max_lines_per_task
        self._logs: dict[str, deque[str]] = defaultdict(
            lambda: deque(maxlen=self.max_lines_per_task)
        )
        self._lock = RLock()

    def __call__(self, message: Any) -> None:
        try:
            record = message.record
            task_id = record.get("extra", {}).get("job_id")
            if not task_id:
                return

            timestamp = record["time"].strftime("%Y-%m-%d %H:%M:%S")
            level = record["level"].name
            rendered = str(record["message"])
            exception = record.get("exception")
            if exception:
                rendered = f"{rendered} | {exception}"
            self.append(task_id, f"{timestamp} | {level:<8} | {rendered}")
        except Exception:
            # Logging must never interfere with the worker.
            return

    def append(self, task_id: str, line: str) -> None:
        with self._lock:
            self._logs[task_id].append(line)

    def get(self, task_id: str, limit: int = 500) -> list[str]:
        with self._lock:
            lines = list(self._logs.get(task_id, ()))
        return lines[-max(1, limit):]

    def clear(self, task_id: str) -> None:
        with self._lock:
            self._logs.pop(task_id, None)


task_log_store = TaskLogStore()
