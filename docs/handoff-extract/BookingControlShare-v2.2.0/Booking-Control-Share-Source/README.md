# Booking Control Share 2.2.0

This is a standalone Windows booking automation app. No app account, device
approval, cloud management, remote commands, telemetry, or automatic update
connection is included. Each person enters their own booking-site credentials.

The release timer and login/navigation recovery are preserved. Browser traces
are disabled. Task logs stay in memory; only generic startup diagnostics are
written to the app's separate data directory. Account fields start empty and
are not saved by the interface.

## Run the portable app

Extract the entire ZIP and open `Booking Control Share.exe`. Keep the `backend`
folder beside it. Internet access is needed for the booking site and the first
browser download. The separate installer is optional.

The local backend uses a fresh random token each launch. This is internal
protection for the app's local API; users do not need to enter an app API key.

## What is included

The portable ZIP contains only the application, its backend, this README, and
a checksum manifest. It includes no environment files, user profiles, saved
accounts, device identities, booking logs, traces, databases, or checkout data.
Share the ZIP or installer, rather than copying your application data directory.

The separate source ZIP contains reviewed source and test fixtures with fake
data. Cloud infrastructure, deployment configuration, local environment files,
build caches, and runtime data are excluded.

## Build from the source ZIP

Install uv/Python 3.12, Node.js/pnpm, and Rust with the Windows MSVC build tools.
Run `build-share.bat` from the extracted source folder. Dependencies are resolved
from the included lockfiles. The result is an NSIS installer in
`src-tauri/target/release/bundle/nsis`.

Run backend checks with `uv run pytest -q` from `backend`. Browser integration
tests are opt-in and use local test pages, not live bookings.
