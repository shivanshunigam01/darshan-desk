# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

BACKEND_DIR = Path(SPECPATH).resolve()
SRC_DIR = BACKEND_DIR / "src"
ENTRYPOINT = BACKEND_DIR / "packaging" / "entrypoint.py"
ZOOM_EXTENSION_DIR = SRC_DIR / "zoom-extension"
ZOOM_EXTENSION_REQUIRED_FILES = (
    "manifest.json",
    "content.js",
    "service_worker.js",
    "main.html",
    "icon128.png",
)
missing_extension_files = [
    name for name in ZOOM_EXTENSION_REQUIRED_FILES if not (ZOOM_EXTENSION_DIR / name).is_file()
]
if missing_extension_files:
    raise SystemExit(
        f"Zoom extension is incomplete at {ZOOM_EXTENSION_DIR}: {missing_extension_files}"
    )


datas = []
binaries = []
hiddenimports = []
datas += copy_metadata("fastapi")

datas += copy_metadata("pydantic")

datas += copy_metadata("uvicorn")
hiddenimports += collect_submodules("app")

tmp_ret = collect_all("cloakbrowser")

datas += tmp_ret[0]
binaries += tmp_ret[1]
hiddenimports += tmp_ret[2]

tmp_ret = collect_all("ddddocr")

datas += tmp_ret[0]
binaries += tmp_ret[1]
hiddenimports += tmp_ret[2]

# Add every extension file under the exact folder expected by _zoom_extension_path().
for extension_file in ZOOM_EXTENSION_DIR.rglob("*"):
    if extension_file.is_file():
        destination = Path("zoom-extension") / extension_file.relative_to(ZOOM_EXTENSION_DIR).parent
        datas.append((str(extension_file), str(destination)))


a = Analysis(
    [str(ENTRYPOINT)],
    pathex=[str(SRC_DIR)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="ttdapi",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
