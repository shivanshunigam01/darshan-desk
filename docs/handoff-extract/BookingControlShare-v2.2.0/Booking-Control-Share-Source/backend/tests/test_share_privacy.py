from __future__ import annotations

import asyncio
import importlib.util
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.core.config import Settings, settings
from app.main import app
from app.services.ttd.router import enqueue
from app.workers.models import TTDRequest
from app.workers.worker import TaskWorker


def test_shared_build_has_no_cloud_or_remote_logging_configuration():
    config = Settings(
        _env_file=None, CONTROL_PLANE_URL="https://unused.invalid", DEVICE_TOKEN="unused"
    )
    assert not hasattr(config, "CONTROL_PLANE_URL")
    assert not hasattr(config, "DEVICE_TOKEN")
    assert not hasattr(config, "SEQ_URL")
    assert importlib.util.find_spec("app.core.cloud") is None
    assert importlib.util.find_spec("app.config.client") is None


def test_share_build_keeps_local_api_protected(monkeypatch):
    monkeypatch.setattr(settings, "API_KEY", "share-test-session-key")
    client = TestClient(app)
    assert client.get("/tasks").status_code in (401, 403)
    assert client.get("/tasks", headers={"X-API-Key": "wrong"}).status_code == 403
    assert client.get("/tasks", headers={"X-API-Key": "share-test-session-key"}).status_code == 200


def test_share_booking_request_cannot_enable_sensitive_browser_traces(monkeypatch):
    queued = []

    def collect(task):
        queued.append(task)
        return task

    worker = SimpleNamespace(enqueue=collect)
    monkeypatch.setattr(TaskWorker, "get_instance", staticmethod(lambda: worker))
    asyncio.run(enqueue(TTDRequest(mode="manual", count=1, trace=True)))
    assert len(queued) == 1
    assert queued[0].payload["trace"] is False
