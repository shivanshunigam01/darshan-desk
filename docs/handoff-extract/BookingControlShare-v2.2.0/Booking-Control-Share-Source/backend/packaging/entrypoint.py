from __future__ import annotations

import logging
import os
from pathlib import Path


def _configure_startup_logging() -> logging.Logger:
    """Create a persistent log before importing application modules.

    In frozen --noconsole builds stdout/stderr may be unavailable, so startup
    failures must be written directly to a file instead of relying on console
    output. By default this follows the process working directory, which Tauri
    sets to its per-user application-data directory for packaged builds.
    """
    log_dir = Path(os.environ.get("TTD_LOG_DIR", "logs"))
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "startup.log"
    logging.basicConfig(
        filename=str(log_path),
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        force=True,
    )
    # Keep only generic startup diagnostics on disk. Booking and HTTP logs may
    # contain account data and belong only in the app's in-memory task monitor.
    for handler in logging.getLogger().handlers:
        handler.addFilter(lambda record: record.name == "ttdapi.startup" and not record.exc_info)
    startup_logger = logging.getLogger("ttdapi.startup")
    startup_logger.info(
        "Backend entrypoint started; cwd=%s; log_file=%s",
        Path.cwd(),
        log_path.resolve(),
    )
    return startup_logger


def main() -> None:
    startup_logger = _configure_startup_logging()
    try:
        import uvicorn

        from app.core.config import settings
        from app.main import app

        startup_logger.info(
            "Starting Uvicorn; host=%s; port=%s; environment=%s",
            settings.HOST,
            settings.PORT,
            settings.ENVIRONMENT,
        )
        # Preserve the file-based logging handlers above. The application also
        # installs its richer Loguru logs during FastAPI lifespan startup.
        uvicorn.run(
            app,
            host=settings.HOST,
            port=settings.PORT,
            reload=False,
            log_config=None,
        )
        startup_logger.info("Uvicorn server stopped cleanly")
    except BaseException as exc:
        startup_logger.error("Backend startup or runtime failed (%s)", type(exc).__name__)
        raise


if __name__ == "__main__":
    main()
