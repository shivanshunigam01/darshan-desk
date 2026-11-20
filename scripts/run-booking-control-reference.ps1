# Booking Control Share v2.2.0 (reference handoff) — dev launcher
# Prerequisites: Python 3.12, uv, pnpm, Rust stable, Visual Studio Build Tools (C++)

$ErrorActionPreference = "Stop"
$Root = if ($env:BCS_ROOT) { $env:BCS_ROOT } else { "C:\BCS" }
if (-not (Test-Path "$Root\src-tauri\tauri.conf.json")) {
  Write-Host "Expected extracted source at $Root (copy from docs\handoff-extract\...)."
  exit 1
}

$env:Path = "$env:USERPROFILE\.cargo\bin;$env:LOCALAPPDATA\Programs\Python\Python312\Scripts;" +
  [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
  [System.Environment]::GetEnvironmentVariable("Path", "User")

Set-Location "$Root\src-tauri"
node "$Root\ui\node_modules\@tauri-apps\cli\tauri.js" dev