"""Create audited portable/source archives from an explicit file allowlist."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "2.2.0"
APP = f"Booking Control Share v{VERSION}"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit_text(path: Path) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    emails = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
    emails = [email for email in emails if email != "128x128@2x.png"]  # Tauri icon filename.
    if any(
        not re.search(r"@(?:[\w.-]+\.)?example\.(?:com|org|net|invalid)$", email)
        for email in emails
    ):
        raise ValueError(f"Non-example email found in {path.name}")
    patterns = [
        r"https?://[^\s\"']+\.workers\.dev",
        r"AKIA[0-9A-Z]{16}",
        r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        r"rzp_live_[A-Za-z0-9]{8,}",
        r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.",
        r"[A-Z]:[/\\]Users[/\\]",
    ]
    if any(re.search(pattern, text) for pattern in patterns):
        raise ValueError(f"Private endpoint, credential or machine path found in {path.name}")


def source_files() -> list[Path]:
    explicit = [
        "build-share.bat",
        "src-tauri/Cargo.toml",
        "src-tauri/Cargo.lock",
        "src-tauri/build.rs",
        "src-tauri/tauri.conf.json",
        "src-tauri/tauri.windows.conf.json",
        "ui/package.json",
        "ui/pnpm-lock.yaml",
        "ui/pnpm-workspace.yaml",
        "ui/index.html",
        "ui/components.json",
        "ui/postcss.config.js",
        "ui/tailwind.config.js",
        "ui/vite.config.ts",
        "ui/tsconfig.json",
        "ui/tsconfig.app.json",
        "ui/tsconfig.node.json",
        "ui/.env.example",
        "backend/pyproject.toml",
        "backend/uv.lock",
        "backend/.python-version",
        "backend/ttdapi.spec",
        "backend/main.py",
        "backend/.env.example",
        "backend/packaging/build_backend.py",
        "backend/packaging/entrypoint.py",
        "backend/packaging/smoke_test_backend.py",
        "backend/scripts/network_check.py",
        "backend/scripts/ttd_booking_helper.py",
        "backend/scripts/demo_payload_checkout_browser.py",
        "scripts/prepare_share.py",
    ]
    files = [ROOT / name for name in explicit]
    suffixes = {
        ".py",
        ".rs",
        ".ts",
        ".tsx",
        ".js",
        ".css",
        ".html",
        ".json",
        ".png",
        ".ico",
        ".icns",
        ".svg",
        ".jpg",
        ".jpeg",
        ".woff",
        ".woff2",
    }
    for folder in [
        "backend/src",
        "backend/tests",
        "ui/src",
        "ui/public",
        "src-tauri/src",
        "src-tauri/icons",
        "src-tauri/capabilities",
    ]:
        for path in (ROOT / folder).rglob("*"):
            if path.is_file() and "__pycache__" not in path.parts and path.suffix in suffixes:
                files.append(path)
    return sorted(set(files))


def main() -> None:
    from PyInstaller.archive.readers import CArchiveReader

    backend = ROOT / "backend/dist/ttdapi.exe"
    archive = CArchiveReader(str(backend))
    pyz = archive.open_embedded_archive(next(name for name in archive.toc if name.endswith(".pyz")))
    assert "app.core.cloud" not in pyz.toc and "app.config.client" not in pyz.toc
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--replace", action="store_true", help="Replace only verified prior release files"
    )
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    portable = output / APP
    portable_zip = output / f"{APP} Portable.zip"
    source_zip = output / f"{APP} Source.zip"
    installer = output / f"{APP} Setup.exe"
    if args.replace:
        old_manifest = json.loads((portable / "SHA256.json").read_text(encoding="utf-8"))
        expected = {"Booking Control Share.exe", "backend/ttdapi.exe", "README.md"}
        assert set(old_manifest) == expected
        actual = {
            path.relative_to(portable).as_posix() for path in portable.rglob("*") if path.is_file()
        }
        assert actual == expected | {"SHA256.json"}, "Unexpected files in release folder"
        for name, expected_hash in old_manifest.items():
            assert digest(portable / name) == expected_hash, "Release files were changed"
        old_report = json.loads((output / f"{APP} Audit.json").read_text(encoding="utf-8"))
        for path in (portable_zip, source_zip, installer):
            assert digest(path) == old_report["sha256"][path.name], "Archive was changed"
    else:
        for path in (portable, portable_zip, source_zip, installer):
            if path.exists():
                raise FileExistsError(f"Refusing to overwrite {path.name}")
    sources = source_files()
    text_suffixes = {
        ".py",
        ".rs",
        ".ts",
        ".tsx",
        ".js",
        ".css",
        ".html",
        ".json",
        ".toml",
        ".yaml",
        ".lock",
        ".bat",
        ".spec",
        ".example",
    }
    for source in sources:
        if not source.is_file():
            raise FileNotFoundError(source.relative_to(ROOT))
        if source.suffix in text_suffixes:
            audit_text(source)
    readme = ROOT / "SHARE_README.md"
    audit_text(readme)
    portable.mkdir(exist_ok=args.replace)
    (portable / "backend").mkdir(exist_ok=args.replace)
    shutil.copy2(
        ROOT / "src-tauri/target/release/booking-control-share.exe",
        portable / "Booking Control Share.exe",
    )
    shutil.copy2(backend, portable / "backend/ttdapi.exe")
    shutil.copy2(readme, portable / "README.md")
    manifest = {
        str(path.relative_to(portable)).replace("\\", "/"): digest(path)
        for path in portable.rglob("*")
        if path.is_file() and path.name != "SHA256.json"
    }
    (portable / "SHA256.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    archive_mode = "w" if args.replace else "x"
    with zipfile.ZipFile(portable_zip, archive_mode, compression=zipfile.ZIP_DEFLATED) as archive:
        for path in portable.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(output))
    with zipfile.ZipFile(source_zip, archive_mode, compression=zipfile.ZIP_DEFLATED) as archive:
        prefix = Path("Booking-Control-Share-Source")
        archive.write(readme, prefix / "README.md")
        for path in sources:
            archive.write(path, prefix / path.relative_to(ROOT))
    shutil.copy2(
        ROOT / "src-tauri/target/release/bundle/nsis/Booking Control Share_2.2.0_x64-setup.exe",
        installer,
    )
    for archive_path in (portable_zip, source_zip):
        with zipfile.ZipFile(archive_path) as archive:
            assert archive.testzip() is None
            for name in archive.namelist():
                path = Path(name)
                assert not path.is_absolute() and ".." not in path.parts
                assert path.suffix not in {".log", ".db", ".sqlite", ".pyc", ".har"}
                assert path.name != ".env" and not path.name.startswith(".env.local")
    report = {
        "version": VERSION,
        "source_files": len(sources),
        "runtime_user_data_included": False,
        "source_credential_scan": "passed",
        "cloud_management_included": False,
        "sha256": {path.name: digest(path) for path in (portable_zip, source_zip, installer)},
    }
    (output / f"{APP} Audit.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "portable": str(portable_zip),
                "source": str(source_zip),
                "installer": str(installer),
                "source_files": len(sources),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
