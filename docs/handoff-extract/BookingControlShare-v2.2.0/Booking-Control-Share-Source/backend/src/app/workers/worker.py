from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from loguru import logger

from app.core.config import settings
from app.workers.models import Task, TaskStatus, TaskType

TaskHandler = Callable[[Task], Awaitable[dict[str, Any]]]


class TaskWorker:
    """In-process async queue with configurable global concurrency."""

    instance: "TaskWorker | None" = None

    def __init__(self, max_concurrent: int | None = None):
        self.max_concurrent = max(1, max_concurrent or settings.MAX_CONCURRENT)
        self.semaphore = asyncio.Semaphore(self.max_concurrent)
        self.queue: deque[str] = deque()
        self.tasks: dict[str, Task] = {}
        self.handlers: dict[TaskType, TaskHandler] = {}
        self.running_tasks: dict[str, asyncio.Task[Any]] = {}
        self.active_clients: dict[str, Any] = {}
        self.worker_counter = 0
        self.running = False
        self.loop_task: asyncio.Task[None] | None = None

    @classmethod
    def get_instance(cls) -> "TaskWorker":
        if cls.instance is None:
            cls.instance = cls()
        return cls.instance

    def register(self, task_type: TaskType, handler: TaskHandler) -> None:
        self.handlers[task_type] = handler

    def enqueue(self, task: Task) -> Task:
        self.tasks[task.id] = task
        self.queue.append(task.id)
        return task

    def get_task(self, task_id: str) -> Task | None:
        return self.tasks.get(task_id)

    def get_client(self, task_id: str) -> Any | None:
        return self.active_clients.get(task_id)

    def register_client(self, task_id: str, client: Any) -> None:
        self.active_clients[task_id] = client

    def unregister_client(self, task_id: str) -> None:
        self.active_clients.pop(task_id, None)

    def set_max_concurrent(self, value: int) -> int:
        if value < 1 or value > 100:
            raise ValueError("max_concurrent must be between 1 and 100")
        self.max_concurrent = value
        # Tasks already holding the previous semaphore continue normally. New
        # tasks use the new limit. The scheduler below independently caps the
        # number of running tasks, so reducing the value is safe as well.
        self.semaphore = asyncio.Semaphore(value)
        return value

    def cancel_task(self, task_id: str) -> bool:
        """Cancel a queued or currently-running task.

        For running tasks this cancels the asyncio task that owns the browser
        session. The TTD client's async context manager then gets a chance to
        finalize its Playwright trace and close the browser cleanly.
        """
        task = self.tasks.get(task_id)
        if not task:
            return False

        if task.status == TaskStatus.PENDING:
            task.status = TaskStatus.CANCELLED
            return True

        running = self.running_tasks.get(task_id)
        if task.status == TaskStatus.RUNNING and running is not None and not running.done():
            task.status = TaskStatus.CANCELLED
            running.cancel()
            return True

        return False

    @property
    def queue_size(self) -> int:
        return sum(
            1
            for task_id in self.queue
            if task_id in self.tasks and self.tasks[task_id].status == TaskStatus.PENDING
        )

    @property
    def active_count(self) -> int:
        return sum(1 for task in self.tasks.values() if task.status == TaskStatus.RUNNING)

    async def start(self) -> None:
        if self.running:
            return
        self.running = True
        self.loop_task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self.running = False
        if self.loop_task:
            self.loop_task.cancel()
            await asyncio.gather(self.loop_task, return_exceptions=True)
            self.loop_task = None

    async def _loop(self) -> None:
        while self.running:
            while self.queue and self.active_count < self.max_concurrent:
                task_id = self.queue.popleft()
                task = self.tasks.get(task_id)
                if not task or task.status != TaskStatus.PENDING:
                    continue

                self.worker_counter += 1
                task.worker_id = self.worker_counter
                job = asyncio.create_task(self._run(task))
                self.running_tasks[task.id] = job
                task_id_for_callback = task.id
                job.add_done_callback(
                    lambda _job, task_id=task_id_for_callback: self.running_tasks.pop(task_id, None)
                )

            await asyncio.sleep(0.05)

    async def _run(self, task: Task) -> None:
        handler = self.handlers.get(task.type)
        log = logger.bind(
            job_id=task.id,
            worker_id=task.worker_id or "-",
            task_type=str(task.type),
        )

        if not handler:
            task.status = TaskStatus.FAILED
            task.error = f"No handler registered for {task.type}"
            log.error(task.error)
            return

        async with self.semaphore:
            task.status = TaskStatus.RUNNING
            task.started_at = datetime.now(timezone.utc)
            log.info("Task started")
            try:
                timeout_seconds = settings.TASK_TIMEOUT_SECONDS
                if task.type == TaskType.TTD and task.payload.get("mode") == "auto":
                    if task.payload.get("booking_strategy", "browser") == "http_payload":
                        timeout_seconds = None
                    elif task.payload.get("booking_type") == "future":
                        timeout_seconds = settings.FUTURE_BOOKING_TASK_TIMEOUT_SECONDS

                if timeout_seconds is None:
                    task.result = await handler(task)
                else:
                    task.result = await asyncio.wait_for(handler(task), timeout_seconds)
                task.status = TaskStatus.COMPLETED
                log.info("Task completed")
            except asyncio.CancelledError:
                task.status = TaskStatus.CANCELLED
                log.warning("Task cancelled")
                raise
            except Exception as exc:
                log.exception("Task failed")
                task.status = TaskStatus.FAILED
                task.error = str(exc)
            finally:
                task.completed_at = datetime.now(timezone.utc)
