from app.core.config import settings
from app.services.ttd.client import TTDClient
from app.services.ttd.manual_release import get_manual_release_gate
from app.services.ttd.payload_client import PayloadBookingClient
from app.workers.models import Task
from app.workers.worker import TaskWorker


async def handle_ttd(task: Task) -> dict:
    mode = task.payload.get("mode")
    if mode not in {"manual", "auto"}:
        raise ValueError(f"Unsupported or missing TTD task mode: {mode!r}")

    worker = TaskWorker.get_instance()

    if mode == "auto" and task.payload.get("booking_strategy", "browser") == "http_payload":
        client = PayloadBookingClient(
            task_id=task.id,
            worker_id=task.worker_id or 0,
            headless=task.payload.get("headless", settings.HEADLESS),
            trace=task.payload.get("trace", False),
        )
        worker.register_client(task.id, client)
        try:
            return await client.execute_auto(task)
        finally:
            worker.unregister_client(task.id)

    async with TTDClient(
        task_id=task.id,
        worker_id=task.worker_id or 0,
        headless=task.payload.get("headless", settings.HEADLESS),
        trace=task.payload.get("trace", False),
    ) as client:
        worker.register_client(task.id, client)
        try:
            if mode == "auto":
                return await client.execute_auto(task)

            release_id = task.payload.get("manual_release_id")
            if not release_id:
                raise ValueError("Manual TTD task is missing its manual release ID.")

            release_gate = get_manual_release_gate(release_id)
            if release_gate is None:
                raise ValueError(
                    f"Manual TTD release batch {release_id!r} is no longer available."
                )

            return await client.execute(task, release_gate=release_gate)
        finally:
            worker.unregister_client(task.id)