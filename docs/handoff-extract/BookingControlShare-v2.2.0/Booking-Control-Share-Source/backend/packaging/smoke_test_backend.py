from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "backend-dist"
EXECUTABLE = Path(
    os.environ.get(
        "TTD_BACKEND_SMOKE_EXECUTABLE", str(DIST / ("ttdapi.exe" if os.name == "nt" else "ttdapi"))
    )
)
RUNTIME_DIR = Path(os.environ.get("TTD_BACKEND_SMOKE_RUNTIME", str(DIST / "smoke-test-runtime")))
STARTUP_TIMEOUT_SECONDS = float(os.environ.get("TTD_BACKEND_SMOKE_TIMEOUT_SECONDS", "45"))


def _free_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def _read_log_tail(path: Path, max_lines: int = 100) -> str:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return "(log unavailable)"
    return "\n".join(lines[-max_lines:]) or "(empty)"


def _dump_diagnostics() -> None:
    print("\n===== Packaged backend startup diagnostics =====", file=sys.stderr)
    for path in sorted(RUNTIME_DIR.rglob("*")):
        if path.is_file():
            print(f"\n--- {path.relative_to(RUNTIME_DIR)} (last 100 lines) ---", file=sys.stderr)
            print(_read_log_tail(path), file=sys.stderr)
    print("===== End backend diagnostics =====", file=sys.stderr)


def _stop_test_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        # The one-file launcher has a child server. Target only our test tree.
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
            check=False,
        )
    else:
        process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> int:
    if not EXECUTABLE.is_file():
        print(f"ERROR: built backend executable not found: {EXECUTABLE}", file=sys.stderr)
        return 1

    # Keep the runtime isolated from the checkout and retain startup logs as a
    # CI artifact if the smoke test fails.
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    logs_dir = RUNTIME_DIR / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    stdout_path = RUNTIME_DIR / "process.stdout.log"
    stderr_path = RUNTIME_DIR / "process.stderr.log"
    port = _free_local_port()
    env = os.environ.copy()
    env.update(
        {
            "HOST": "127.0.0.1",
            "PORT": str(port),
            "API_KEY": "ttdapi-packaged-smoke-test-key",
            "HEADLESS": "true",
            "TTD_LOG_DIR": str(logs_dir),
            "PYTHONUNBUFFERED": "1",
        }
    )
    url = f"http://127.0.0.1:{port}/health"
    process: subprocess.Popen[bytes] | None = None

    try:
        with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
            print(f"Starting packaged backend: {EXECUTABLE}")
            print(f"Probing health endpoint: {url}")
            process = subprocess.Popen(
                [str(EXECUTABLE)],
                cwd=RUNTIME_DIR,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
            )
            print(f"Backend process started with PID {process.pid}")
            deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
            last_error = "health endpoint has not responded yet"

            while time.monotonic() < deadline:
                exit_code = process.poll()
                if exit_code is not None:
                    last_error = f"backend process exited early with code {exit_code}"
                    break
                try:
                    with urlopen(url, timeout=1.5) as response:
                        body = response.read().decode("utf-8", errors="replace")
                        if response.status != 200:
                            last_error = f"health returned HTTP {response.status}: {body[:500]}"
                        else:
                            payload = json.loads(body)
                            if payload.get("status") == "ok":
                                print(
                                    f"PASS: packaged backend started and /health returned: {body}"
                                )
                                return 0
                            last_error = f"unexpected health response: {body[:500]}"
                except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
                    last_error = f"{type(exc).__name__}: {exc}"
                time.sleep(0.25)

            print(
                f"ERROR: packaged backend failed its startup health check after "
                f"{STARTUP_TIMEOUT_SECONDS:.1f}s: {last_error}",
                file=sys.stderr,
            )
            # Flush/close subprocess output handles before collecting diagnostics.
            _stop_test_process(process)
        _dump_diagnostics()
        return 1
    except OSError as exc:
        print(f"ERROR: could not execute packaged backend: {exc}", file=sys.stderr)
        _dump_diagnostics()
        return 1
    finally:
        if process is not None:
            _stop_test_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
