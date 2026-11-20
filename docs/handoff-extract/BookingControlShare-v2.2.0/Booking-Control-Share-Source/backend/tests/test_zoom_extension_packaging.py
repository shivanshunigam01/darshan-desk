import json
import tomllib
from pathlib import Path

from app.core.browser import _is_complete_zoom_extension, _zoom_extension_path


def test_zoom_extension_is_complete_and_resolvable() -> None:
    extension_dir = _zoom_extension_path()
    assert _is_complete_zoom_extension(extension_dir), (
        f"Zoom extension is incomplete at {extension_dir}; files: "
        f"{sorted(path.name for path in extension_dir.iterdir()) if extension_dir.is_dir() else 'directory missing'}"
    )

    manifest = json.loads((extension_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["manifest_version"] == 3
    assert manifest["background"]["service_worker"] == "service_worker.js"
    assert any("content.js" in script.get("js", []) for script in manifest["content_scripts"])


def test_all_build_targets_package_the_extension() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    build_script = (backend_root / "packaging" / "build_backend.py").read_text(encoding="utf-8")
    spec_text = (backend_root / "ttdapi.spec").read_text(encoding="utf-8")
    project = tomllib.loads((backend_root / "pyproject.toml").read_text(encoding="utf-8"))

    assert "ZOOM_EXTENSION" in build_script and "--add-data" in build_script
    assert "ZOOM_EXTENSION_DIR" in spec_text and 'Path("zoom-extension")' in spec_text
    wheel_force_include = project["tool"]["hatch"]["build"]["targets"]["wheel"]["force-include"]
    assert wheel_force_include["src/zoom-extension"] == "zoom-extension"
