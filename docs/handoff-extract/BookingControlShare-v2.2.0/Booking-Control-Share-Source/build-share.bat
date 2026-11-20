@echo off
setlocal
cd /d "%~dp0backend"
uv sync --frozen
if errorlevel 1 exit /b 1
uv run --no-sync pyinstaller --noconfirm ttdapi.spec
if errorlevel 1 exit /b 1
cd /d "%~dp0"
cd /d "%~dp0ui"
pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1
cd /d "%~dp0"
node "ui\node_modules\@tauri-apps\cli\tauri.js" build --bundles nsis
if errorlevel 1 exit /b 1
endlocal
