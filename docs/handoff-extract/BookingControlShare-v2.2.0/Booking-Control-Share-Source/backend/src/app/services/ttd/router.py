from fastapi import APIRouter, HTTPException

from app.services.ttd.manual_release import (
    create_manual_release_group,
    release_manual_group,
)
from app.workers.models import (
    EnqueueResponse,
    ManualReleaseResponse,
    Task,
    TaskSummary,
    TaskType,
    TTDRequest,
)
from app.workers.worker import TaskWorker

router = APIRouter()


@router.post(
    "/manual-release/{release_id}",
    response_model=ManualReleaseResponse,
)
async def manual_release(release_id: str):
    already_released = release_manual_group(release_id)

    if already_released is None:
        raise HTTPException(
            status_code=404,
            detail=f"Manual release batch {release_id!r} was not found",
        )

    return ManualReleaseResponse(
        release_id=release_id,
        released=True,
        already_released=already_released,
    )


@router.post("/", response_model=EnqueueResponse)
async def enqueue(req: TTDRequest):
    """Enqueue manual instances or independent automated bookings.

    Manual mode:
        one Task is created per ``count``.

    Auto mode:
        one Task is created per item in ``bookings``. Each booking owns its
        own account credentials and pilgrim data.
    """
    worker = TaskWorker.get_instance()
    tasks: list[TaskSummary] = []
    manual_release_id: str | None = None

    if req.mode == "manual":
        manual_release_id = create_manual_release_group()
        for _ in range(req.count or 0):
            task = worker.enqueue(
                Task(
                    type=TaskType.TTD,
                    payload={
                        "mode": "manual",
                        "headless": req.headless,
                        "trace": False,
                        "manual_release_id": manual_release_id,
                    },
                )
            )
            tasks.append(TaskSummary(id=task.id, status=task.status, created_at=task.created_at))
    else:
        for booking in req.bookings or []:
            task = worker.enqueue(
                Task(
                    type=TaskType.TTD,
                    payload={
                        "mode": "auto",
                        "headless": req.headless,
                        "trace": False,
                        **booking.model_dump(),
                    },
                )
            )
            tasks.append(TaskSummary(id=task.id, status=task.status, created_at=task.created_at))

    return EnqueueResponse(
        enqueued=len(tasks),
        tasks=tasks,
        manual_release_id=manual_release_id,
    )
