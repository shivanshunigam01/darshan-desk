from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
DIST = ROOT / "backend-dist"
ENTRYPOINT = BACKEND / "packaging" / "entrypoint.py"
ZOOM_EXTENSION = BACKEND / "src" / "zoom-extension"
ZOOM_EXTENSION_REQUIRED_FILES = (
    "manifest.json",
    "content.js",
    "service_worker.js",
    "main.html",
    "icon128.png",
)


def main() -> None:
    missing_extension_files = [
        name for name in ZOOM_EXTENSION_REQUIRED_FILES if not (ZOOM_EXTENSION / name).is_file()
    ]
    if missing_extension_files:
        raise SystemExit(
            f"Zoom extension is incomplete at {ZOOM_EXTENSION}: {missing_extension_files}"
        )

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    pyinstaller = shutil.which("pyinstaller")
    if pyinstaller is None:
        raise SystemExit("PyInstaller is not installed. Run: uv sync")

    name = "ttdapi"
    cmd = [
        pyinstaller,
        "--noconfirm",
        "--clean",
        "--onefile",
        "--noconsole",
        "--name",
        name,
        "--paths",
        str(BACKEND / "src"),
        "--collect-submodules",
        "app",
        "--collect-all",
        "cloakbrowser",
        "--collect-all",
        "ddddocr",
        "--add-data",
        f"{ZOOM_EXTENSION}{os.pathsep}zoom-extension",
        "--copy-metadata",
        "fastapi",
        "--copy-metadata",
        "pydantic",
        "--copy-metadata",
        "uvicorn",
        str(ENTRYPOINT),
    ]

    print("Building backend executable:")
    print(" ".join(cmd))
    subprocess.run(cmd, cwd=BACKEND, check=True)

    built = BACKEND / "dist" / (name + (".exe" if sys.platform == "win32" else ""))
    if not built.exists():
        raise SystemExit(f"PyInstaller completed but output was not found: {built}")

    target = DIST / built.name
    shutil.copy2(built, target)
    print(f"Backend executable: {target}")


if __name__ == "__main__":
    main()
