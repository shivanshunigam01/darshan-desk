from __future__ import annotations

import asyncio
import shutil
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

from cloakbrowser import launch_persistent_context_async
from loguru import logger
from playwright.async_api import Page

from app.core.config import settings

_ZOOM_EXTENSION_REQUIRED_FILES = (
    "manifest.json",
    "content.js",
    "service_worker.js",
    "main.html",
    "icon128.png",
)


def _is_complete_zoom_extension(path: Path) -> bool:
    """Return whether *path* contains every required zoom-extension file."""
    return path.is_dir() and all((path / name).is_file() for name in _ZOOM_EXTENSION_REQUIRED_FILES)


def _zoom_extension_candidates() -> tuple[Path, ...]:
    """Return possible extension locations for source, wheel, and frozen builds."""
    candidates: list[Path] = []

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "zoom-extension")

    # Source checkout: src/zoom-extension. Installed wheel: site-packages/zoom-extension.
    candidates.append(Path(__file__).resolve().parents[2] / "zoom-extension")

    # Also support a sidecar directory next to the executable, if a desktop packager
    # intentionally ships the extension beside rather than inside the executable.
    candidates.append(Path(sys.executable).resolve().parent / "zoom-extension")

    # De-duplicate without requiring the candidate to exist.
    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate.resolve(strict=False))
        if key not in seen:
            seen.add(key)
            unique.append(candidate)
    return tuple(unique)


def _zoom_extension_path() -> Path:
    """Find a complete zoom extension in source, wheel, or frozen layouts.

    If none is complete, return the first expected path so callers can produce a
    useful missing/incomplete-assets error rather than silently disabling zoom.
    """
    candidates = _zoom_extension_candidates()
    for candidate in candidates:
        if _is_complete_zoom_extension(candidate):
            return candidate
    return candidates[0]


class BrowserContextFactory:
    """Creates one isolated CloakBrowser session per worker task.

    Uses only free-tier CloakBrowser features: no `license_key` and no
    `geoip` (geoip requires `pip install cloakbrowser[geoip]` and downloads
    an extra ~70MB dataset, and isn't needed here since we don't route
    through per-session proxies). Everything else (stealth args, locale,
    headless/headed) works the same on the free build.
    """

    @staticmethod
    async def launch(worker_id: int, headless: bool | None = None, trace: bool = False):
        """Launch a persistent CloakBrowser context and return (context, page, scratch_dir).

        A persistent context is used instead of launch_async + new_context
        because Chromium extensions can only be loaded into a persistent
        profile. Playwright strips --load-extension from non-persistent
        launches, so the zoom extension below would silently fail to attach
        with a regular Browser/context pair.
        """
        extension_dir = _zoom_extension_path()
        if not _is_complete_zoom_extension(extension_dir):
            missing = [
                name
                for name in _ZOOM_EXTENSION_REQUIRED_FILES
                if not (extension_dir / name).is_file()
            ]
            searched = ", ".join(str(path) for path in _zoom_extension_candidates())
            raise FileNotFoundError(
                "The TTDAPI zoom extension is missing or incomplete. "
                f"Expected files under {extension_dir}; missing={missing}. "
                f"Searched: {searched}. Rebuild the backend with the extension bundled."
            )

        scratch_dir = Path(tempfile.gettempdir()) / f"ttd_worker_{worker_id}_{uuid.uuid4().hex}"
        scratch_dir.mkdir(parents=True, exist_ok=True)

        profile_dir = scratch_dir / "profile"
        profile_dir.mkdir(parents=True, exist_ok=True)

        resolved_headless = settings.HEADLESS if headless is None else headless

        logger.info("Loading Playwright zoom extension from {}", extension_dir)

        # launch_persistent_context_async returns a BrowserContext, not a
        # Browser. Callers must not call .new_context() on the result.
        context = await launch_persistent_context_async(
            user_data_dir=str(profile_dir),
            headless=resolved_headless,
            locale=settings.BROWSER_LOCALE,
            extension_paths=[str(extension_dir)],
        )

        # Start tracing BEFORE the page is created
        if trace:
            await context.tracing.start(screenshots=True, snapshots=True, live=True)

        page: Page = await context.new_page()
        await page.set_viewport_size({"width": 1200, "height": 800})

        page.set_default_timeout(settings.BROWSER_TIMEOUT_MS)

        logger.info(
            "Worker {} launched CloakBrowser (free tier, headless={}) with 1200x800 viewport",
            worker_id,
            resolved_headless,
        )
        return context, page, scratch_dir

    @staticmethod
    async def set_browser_zoom(page: Page, zoom_percent: int) -> None:
        """Apply and verify native tab zoom from the extension's control page.

        The extension service worker can load without answering page messages in
        CloakBrowser. Its own extension page has the same tabs permission and
        avoids that worker/message dependency entirely.
        """
        if type(zoom_percent) is not int or not 25 <= zoom_percent <= 500:
            raise ValueError("zoom_percent must be an integer between 25 and 500")

        if not page.url.startswith(("http://", "https://")):
            raise ValueError("Navigate to an HTTP(S) page before setting browser zoom")

        def is_zoom_worker(worker: Any) -> bool:
            return worker.url.startswith("chrome-extension://") and worker.url.endswith(
                "/service_worker.js"
            )

        context = page.context
        worker = next(
            (worker for worker in context.service_workers if is_zoom_worker(worker)), None
        )
        if worker is None:
            worker = await context.wait_for_event(
                "serviceworker", predicate=is_zoom_worker, timeout=5000
            )

        target_url = page.url
        controller = await context.new_page()
        try:
            await controller.goto(
                worker.url.rsplit("/", 1)[0] + "/main.html",
                wait_until="domcontentloaded",
                timeout=5000,
            )
            actual_zoom = await asyncio.wait_for(
                controller.evaluate(
                    """async ({ targetUrl, zoomPercent }) => {
                        const tabs = (await chrome.tabs.query({})).filter(tab => tab.url === targetUrl);
                        if (tabs.length !== 1) {
                            throw new Error("Cannot uniquely identify the booking tab for zoom");
                        }
                        await chrome.tabs.setZoom(tabs[0].id, zoomPercent / 100);
                        return await chrome.tabs.getZoom(tabs[0].id);
                    }""",
                    {"targetUrl": target_url, "zoomPercent": zoom_percent},
                ),
                timeout=5,
            )
            if abs(actual_zoom - zoom_percent / 100) > 0.001:
                raise RuntimeError(f"Browser zoom verification failed: expected {zoom_percent}%")
            logger.debug("Verified native browser tab zoom: {}%", zoom_percent)
        finally:
            await controller.close()
            if not page.is_closed():
                await page.bring_to_front()

    @staticmethod
    async def cleanup(context: Any, scratch_dir: Path) -> None:
        """Tear down the persistent context and remove its temporary profile."""
        try:
            if context is not None:
                try:
                    # CloakBrowser stops its Playwright driver in close()'s
                    # finally block, including when a stuck close is cancelled.
                    await asyncio.wait_for(context.close(), timeout=10)
                except TimeoutError:
                    logger.warning("Browser context close timed out; Playwright driver stopped")
                except Exception as exc:
                    logger.warning("Browser context close failed: {}", exc)
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)
