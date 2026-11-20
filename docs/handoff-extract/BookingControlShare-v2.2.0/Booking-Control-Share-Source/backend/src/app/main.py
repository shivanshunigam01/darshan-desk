from __future__ import annotations

import argparse
import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from loguru import logger

from app.config.logging import configure_logging, request_id
from app.core.config import settings
from app.core.security import require_api_key
from app.core.task_logs import task_log_store
from app.services.ttd.router import router as ttd_router
from app.services.ttd.service import handle_ttd
from app.workers.models import (
    CaptchaSubmitRequest,
    ConcurrencyRequest,
    HealthResponse,
    TaskLogsResponse,
    TaskType,
    TaskView,
)
from app.workers.worker import TaskWorker


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    worker = TaskWorker.get_instance()
    worker.register(TaskType.TTD, handle_ttd)
    await worker.start()
    try:
        yield
    finally:
        await worker.stop()


app = FastAPI(
    title="TTD API",
    version="0.2.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request, call_next):
    rid = request.headers.get("X-Request-ID") or request_id()
    with logger.contextualize(request_id=rid):
        response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


@app.get("/docs", include_in_schema=False)
async def scalar_docs():
    return HTMLResponse(
        content="""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="https://docs.scalar.com/favicon.svg">
    <link rel="icon alternate" type="image/png" href="https://docs.scalar.com/favicon.png">
    <title>TTDAPI — API Reference</title>
</head>
<body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
    Scalar.createApiReference('#app', {
        url: '/openapi.json',
        theme: 'default'
    })
</script>
</body>
</html>"""
    )


@app.get("/tasks", response_model=list[TaskView], dependencies=[Depends(require_api_key)])
async def list_tasks(limit: int = Query(default=50, ge=1, le=200)):
    worker = TaskWorker.get_instance()
    tasks = list(worker.tasks.values())[-limit:]
    return [TaskView.from_task(task, worker.get_client(task.id)) for task in reversed(tasks)]


@app.get("/tasks/{task_id}", response_model=TaskView, dependencies=[Depends(require_api_key)])
async def get_task(task_id: str):
    worker = TaskWorker.get_instance()
    task = worker.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskView.from_task(task, worker.get_client(task_id))


@app.get(
    "/tasks/{task_id}/logs",
    response_model=TaskLogsResponse,
    dependencies=[Depends(require_api_key)],
)
async def get_task_logs(
    task_id: str,
    limit: int = Query(default=500, ge=1, le=1000),
):
    worker = TaskWorker.get_instance()
    if worker.get_task(task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskLogsResponse(task_id=task_id, lines=task_log_store.get(task_id, limit))


@app.get(
    "/tasks/{task_id}/captcha",
    dependencies=[Depends(require_api_key)],
)
async def get_task_captcha(task_id: str):
    worker = TaskWorker.get_instance()
    task = worker.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    client = worker.get_client(task_id)
    if client is None:
        raise HTTPException(status_code=409, detail="No live browser is attached to this task.")

    return client.get_captcha_state()


@app.post(
    "/tasks/{task_id}/captcha",
    dependencies=[Depends(require_api_key)],
)
async def submit_task_captcha(task_id: str, req: CaptchaSubmitRequest):
    worker = TaskWorker.get_instance()
    task = worker.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    client = worker.get_client(task_id)
    if client is None:
        raise HTTPException(status_code=409, detail="No live browser is attached to this task.")

    try:
        await client.submit_pilgrim_captcha(req.value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return client.get_captcha_state()


@app.post(
    "/tasks/{task_id}/show-browser",
    response_model=TaskView,
    dependencies=[Depends(require_api_key)],
)
async def show_browser(task_id: str):
    worker = TaskWorker.get_instance()
    task = worker.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    client = worker.get_client(task_id)
    if client is None:
        raise HTTPException(
            status_code=409,
            detail="No live browser is attached to this task.",
        )

    try:
        await client.show_browser()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not show browser: {exc}") from exc

    return TaskView.from_task(task, client)


@app.post(
    "/tasks/{task_id}/cancel",
    response_model=TaskView,
    dependencies=[Depends(require_api_key)],
)
async def cancel_task(task_id: str):
    worker = TaskWorker.get_instance()
    if not worker.cancel_task(task_id):
        task = worker.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        raise HTTPException(status_code=409, detail="Task cannot be cancelled")
    task = worker.get_task(task_id)
    return TaskView.from_task(task, worker.get_client(task_id))


@app.post(
    "/settings/concurrency",
    response_model=HealthResponse,
    dependencies=[Depends(require_api_key)],
)
async def set_concurrency(req: ConcurrencyRequest):
    worker = TaskWorker.get_instance()
    worker.set_max_concurrent(req.max_concurrent)
    logger.info("Worker concurrency changed to {}", req.max_concurrent)
    return {
        "status": "ok",
        "queue_size": worker.queue_size,
        "active": worker.active_count,
        "max_concurrent": worker.max_concurrent,
    }


@app.get("/health", response_model=HealthResponse)
async def health():
    worker = TaskWorker.get_instance()
    return {
        "status": "ok",
        "queue_size": worker.queue_size,
        "active": worker.active_count,
        "max_concurrent": worker.max_concurrent,
    }


app.include_router(
    ttd_router,
    prefix="/register/ttd",
    tags=["TTD"],
    dependencies=[Depends(require_api_key)],
)


# ---------------------------------------------------------------------------
# Manual-fill instance runner (uv run ttdapi --instances)
# ---------------------------------------------------------------------------
def _prompt_instance_count() -> int:
    while True:
        raw = input("How many browser instances do you want to start? ").strip()
        try:
            count = int(raw)
        except ValueError:
            print("Please enter a valid integer.")
            continue
        if count > 0:
            return count
        print("Please enter a positive integer.")


async def _wait_for_enter_keypress() -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, input, "")


async def _run_manual_instances(count: int) -> None:
    from app.services.ttd.client import TTDClient
    from app.workers.models import Task

    configure_logging()
    logger.info(
        "Starting {} manual TTD browser instance(s); status logging every {}s",
        count,
        settings.RELEASE_STATUS_LOG_INTERVAL_SECONDS,
    )

    release_gate = asyncio.Event()
    counter = {"started": 0, "confirmed": 0}

    def note_release_started(idx: int) -> None:
        counter["started"] += 1
        logger.info(
            "Instance {} reached release time; beginning automation ({}/{} instances started)",
            idx,
            counter["started"],
            count,
        )

    def note_release_confirmed(idx: int) -> None:
        counter["confirmed"] += 1
        logger.info(
            "Instance {} Continue confirmation received ({}/{} instances confirmed)",
            idx,
            counter["confirmed"],
            count,
        )

    clients: dict[int, TTDClient] = {}
    clients_lock = asyncio.Lock()

    async def status_logger(stop_event: asyncio.Event) -> None:
        interval = max(1.0, settings.RELEASE_STATUS_LOG_INTERVAL_SECONDS)
        while not stop_event.is_set():
            async with clients_lock:
                snapshot = list(clients.items())

            for idx, client in snapshot:
                try:
                    status = await client.get_status_snapshot()
                except Exception as exc:
                    logger.warning("Instance {} status read failed: {}", idx, exc)
                    continue

                remaining = status.get("seconds_remaining")
                remaining_str = f"{remaining}s" if remaining is not None else "?"
                logger.info(
                    "Instance {} | user={} | filled={} | server={} release={} "
                    "remaining={} | continue={} | status={}",
                    idx,
                    status.get("user") or "-",
                    "yes" if status.get("filled") else "no",
                    status.get("server_time") or "-",
                    status.get("release_time") or "-",
                    remaining_str,
                    "enabled" if status.get("continue_enabled") else "disabled",
                    status.get("status") or "unknown",
                )

            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval)
            except TimeoutError:
                pass

    async def run_one(idx: int) -> None:
        log = logger.bind(worker_id=idx)
        try:
            async with TTDClient(
                task_id=f"manual-{idx}",
                worker_id=idx,
                headless=False,
            ) as client:
                async with clients_lock:
                    clients[idx] = client
                try:
                    task = Task(type=TaskType.TTD, worker_id=idx)
                    await client.execute(
                        task,
                        release_gate=release_gate,
                        on_release_started=note_release_started,
                        on_release_confirmed=note_release_confirmed,
                    )
                    log.success("Instance {} finished successfully", idx)
                finally:
                    async with clients_lock:
                        clients.pop(idx, None)
        except Exception as exc:
            log.exception("Instance {} failed: {}", idx, exc)

    status_stop = asyncio.Event()
    status_task = asyncio.create_task(status_logger(status_stop))
    instance_tasks = [asyncio.create_task(run_one(i + 1)) for i in range(count)]

    await asyncio.sleep(0)
    print("\nBrowser instances are launching in headed mode.")
    print("Fill the form in each browser window, then press Enter to release the gate.")

    try:
        await _wait_for_enter_keypress()
        release_gate.set()
        logger.info(
            "Manual release gate opened; all filled instances may now synchronize "
            "against the portal release time"
        )
        await asyncio.gather(*instance_tasks)
    finally:
        status_stop.set()
        await status_task

    logger.info(
        "All manual instances exited: release_started={}/{} continue_confirmed={}/{}",
        counter["started"],
        count,
        counter["confirmed"],
        count,
    )


def start() -> None:
    parser = argparse.ArgumentParser(prog="ttdapi", description="TTD booking automation")
    parser.add_argument(
        "--instances",
        action="store_true",
        help="Launch standalone headed manual browser instances.",
    )
    args = parser.parse_args()

    if args.instances:
        count = _prompt_instance_count()
        asyncio.run(_run_manual_instances(count))
        return

    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
    )
